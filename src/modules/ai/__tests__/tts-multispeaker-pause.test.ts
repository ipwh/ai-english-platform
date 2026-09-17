// ============================================
// 2026-09-17: 多角色聆聽音訊 — 段間停頓不得破壞 MP3 位元流
//
// 用戶回報（/student/integrated-skills）：
//   聆聽錄音只播到第一句（Ms. Wong 的開場白）就停住，進度條剛開始便停止，
//   按停止再播放亦一樣。
//
// 根因：multiSpeaker 模式在段落之間自行拼接「偽造的靜音 MP3 frame」
//   （MPEG1 / 128kbps / 44100Hz / stereo / 420 bytes），
//   而 Google Cloud TTS 輸出的是 MPEG2 / 24000Hz / mono。
//   Chromium 解碼器在第一段之後即丟出 MEDIA_ERR_DECODE（code 3）並停止播放。
//   （實測：同一批段落不拼接偽造靜音則可正常播完。）
//
// 本測試鎖定的契約：
//   1. 段間停頓由該段自己的 SSML <break> 產生（由 Google 編碼器輸出真實靜音）
//   2. 伺服器「永不」插入任何自行製造的音訊位元
//   3. 第一段不帶停頓；失敗段落不會留下孤立空白
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
}));

vi.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: class {
    synthesizeSpeech = mocks.synthesizeSpeech;
  },
}));

vi.mock('@/modules/ai/services/gcp-auth', () => ({
  loadServiceAccountCredentials: () => ({ project_id: 'test-project', client_email: 'test@example.com' }),
}));

vi.mock('@/shared/logger/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { synthesizeSpeech, parseDialogueForTTS } from '../services/tts-service';

// 每段用可辨識的位元模式，方便驗證拼接結果逐位元等於各段輸出
function segmentBytes(marker: number, length = 8): Buffer {
  return Buffer.alloc(length, marker);
}

function respondWith(...buffers: Buffer[]) {
  let call = 0;
  mocks.synthesizeSpeech.mockImplementation(() => {
    const buffer = buffers[call] ?? buffers[buffers.length - 1];
    call += 1;
    return Promise.resolve([{ audioContent: buffer }]);
  });
}

/** 取得第 n 次（1-based）合成請求的 input */
function requestInput(n: number): { text?: string; ssml?: string } {
  return mocks.synthesizeSpeech.mock.calls[n - 1][0].input;
}

function requestOptions(n: number) {
  return mocks.synthesizeSpeech.mock.calls[n - 1][0];
}

const DIALOGUE = [
  'Woman: Good morning, everyone. I am Ms. Wong, the teacher-in-charge of the Environmental Club.',
  'Boy: Good morning, Ms. Wong. I am Jason, the club chairperson.',
  'Girl: Should we postpone it to the following Saturday, the nineteenth?',
].join('\n');

describe('synthesizeSpeech — multiSpeaker 段間停頓', () => {
  beforeEach(() => {
    mocks.synthesizeSpeech.mockReset();
  });

  it('在第一段之後以 SSML <break> 產生停頓，第一段不帶停頓', async () => {
    respondWith(segmentBytes(0x11), segmentBytes(0x22), segmentBytes(0x33));

    const result = await synthesizeSpeech({ text: DIALOGUE, multiSpeaker: true, speakingRate: 0.9 });

    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(3);
    // 第一段：無段前停頓
    expect(requestInput(1).ssml ?? '').not.toContain('<break');
    // 第二、三段：段前停頓（實測：<break> 放段落開頭有效，放結尾會被裁剪）
    expect(requestInput(2).ssml).toContain('<break time="200ms"/>');
    expect(requestInput(3).ssml).toContain('<break time="200ms"/>');
    // 停頓必須在段落文字「之前」
    expect(requestInput(2).ssml!.indexOf('<break')).toBeLessThan(requestInput(2).ssml!.indexOf('Good morning, Ms. Wong'));
    // 語速交由 SSML prosody 控制
    expect(requestInput(2).ssml).toContain('<prosody rate="0.9">');
    expect(requestOptions(2).audioConfig.speakingRate).toBe(1.0);
    expect(result.mimeType).toBe('audio/mpeg');
  });

  it('伺服器不得插入任何自行製造的音訊位元（回傳值 === 各段輸出逐位元拼接）', async () => {
    const s1 = segmentBytes(0x11, 16);
    const s2 = segmentBytes(0x22, 24);
    const s3 = segmentBytes(0x33, 32);
    respondWith(s1, s2, s3);

    const result = await synthesizeSpeech({ text: DIALOGUE, multiSpeaker: true });

    expect(result.audioContent.equals(Buffer.concat([s1, s2, s3]))).toBe(true);
    // 回歸守門：舊版偽造靜音 frame 的標頭（MPEG1 128kbps 44.1kHz stereo）
    expect(result.audioContent.indexOf(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe(-1);
  });

  it('長段落（>= 200 字）需要段前停頓時，仍強制走 SSML', async () => {
    const longLine = `Boy: ${'This is a long dialogue turn. '.repeat(12)}`;
    respondWith(segmentBytes(0x11), segmentBytes(0x22));

    await synthesizeSpeech({ text: `Woman: Short opener.\n${longLine}`, multiSpeaker: true });

    const input = requestInput(2);
    expect(input.ssml).toBeDefined();
    expect(input.ssml).toContain('<break time="200ms"/>');
    expect(input.text).toBeUndefined();
  });

  it('SSML 超過上限時退回純文字，避免整段合成失敗', async () => {
    const hugeLine = `Boy: ${'a'.repeat(4800)}`;
    respondWith(segmentBytes(0x11), segmentBytes(0x22));

    await synthesizeSpeech({ text: `Woman: Short opener.\n${hugeLine}`, multiSpeaker: true });

    const input = requestInput(2);
    expect(input.text).toBeDefined();
    expect(input.ssml).toBeUndefined();
  });

  it('中間段落失敗時跳過該段，不留孤立空白', async () => {
    const s1 = segmentBytes(0x11, 16);
    const s3 = segmentBytes(0x33, 32);
    let call = 0;
    mocks.synthesizeSpeech.mockImplementation(() => {
      call += 1;
      // 第 2 段的所有重試（3 次）都失敗
      if (call >= 2 && call <= 4) return Promise.reject(new Error('synthesis failed'));
      return Promise.resolve([{ audioContent: call === 1 ? s1 : s3 }]);
    });

    const result = await synthesizeSpeech({ text: DIALOGUE, multiSpeaker: true });

    expect(result.audioContent.equals(Buffer.concat([s1, s3]))).toBe(true);
    // 仍以段前停頓續接下一段，而非插入空白緩衝
    expect(requestInput(5).ssml).toContain('<break time="200ms"/>');
  });

  it('角色對應到不同語音（多人對話功能不可退化成單一 voice）', async () => {
    respondWith(segmentBytes(0x11), segmentBytes(0x22), segmentBytes(0x33));

    await synthesizeSpeech({ text: DIALOGUE, multiSpeaker: true });

    expect(requestOptions(1).voice.name).toBe('en-US-Standard-H'); // Woman
    expect(requestOptions(2).voice.name).toBe('en-US-Standard-B'); // Boy
    expect(requestOptions(3).voice.name).toBe('en-US-Standard-C'); // Girl
  });

  it('單人模式不受影響：短文本用 SSML prosody、長文本用 audioConfig 控制語速，且無段前停頓', async () => {
    respondWith(segmentBytes(0x44));

    const result = await synthesizeSpeech({ text: 'A plain sentence.', speakingRate: 0.75 });

    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(requestInput(1).ssml).toContain('<prosody rate="0.75">');
    expect(requestInput(1).ssml).not.toContain('<break');
    expect(requestOptions(1).audioConfig.speakingRate).toBe(1.0);
    expect(result.audioContent.equals(segmentBytes(0x44))).toBe(true);

    mocks.synthesizeSpeech.mockReset();
    respondWith(segmentBytes(0x44));

    await synthesizeSpeech({ text: 'a'.repeat(300), speakingRate: 0.75 });

    expect(requestInput(1).text).toBeDefined();
    expect(requestOptions(1).audioConfig.speakingRate).toBe(0.75);
  });
});

describe('parseDialogueForTTS', () => {
  it('解析角色標籤並保留逐行台詞', () => {
    expect(parseDialogueForTTS(DIALOGUE)).toEqual([
      { speaker: 'woman', text: 'Good morning, everyone. I am Ms. Wong, the teacher-in-charge of the Environmental Club.' },
      { speaker: 'boy', text: 'Good morning, Ms. Wong. I am Jason, the club chairperson.' },
      { speaker: 'girl', text: 'Should we postpone it to the following Saturday, the nineteenth?' },
    ]);
  });
});
