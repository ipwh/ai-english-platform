// ============================================
// 2026-10-04 生產事故：IELTS 聆聽音訊朗讀角色名（"Librarian:"／"Visitor:"）
//
// 用戶回報：IELTS 聆聽錄音會讀出角色名稱（例如 MAN／WOMAN 等角色標籤），影響體驗。
// 生產庫實測（唯讀查詢 IeltsSection.transcriptText）：唯一一卷的逐字稿為
//   'Librarian: Welcome to Eastside Library. … Visitor: Yes, please. …'
//   — 單行、標籤在行內（無換行），角色名為 Librarian／Visitor。
//
// 根因：parseDialogueForTTS 只認 Woman/Man/Boy/Girl，且以 '\n' 逐行解析：
//   1) 未知角色標籤落到 fallback 分支 → 整行（含 "Librarian:"）交給 TTS 朗讀
//   2) 單行逐字稿只有一行 → 完全不做角色分段（全部用同一把女聲）
//
// 本測試鎖定的契約：
//   A. 任何可辨識的角色標籤永不進入合成文字（含行內標籤）
//   B. 同一角色固定同一把聲音；未知角色女／男輪替（對話不可退化成單一聲音）
//   C. 只有標籤、沒有台詞的行整行略過
//   D. 正文連接詞（However:/Note:）不得被誤判為角色而吃掉台詞
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ synthesizeSpeech: vi.fn() }));

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

/** 正式環境起始卷的逐字稿（單行、行內標籤、角色名為 Librarian／Visitor） */
const PRODUCTION_TRANSCRIPT =
  'Librarian: Welcome to Eastside Library. Are you here to join? ' +
  'Visitor: Yes, please. I would like a membership card for my daughter, she is nine. ' +
  'Librarian: Children under twelve need a parent\u2019s signature, and the card is free. ' +
  'Visitor: Perfect. What time do you close on Saturdays? ' +
  'Librarian: We close at half past five on Saturdays and at eight on weekdays.';

function spokenTexts(text: string): string[] {
  return parseDialogueForTTS(text).map((s) => s.text);
}

describe('parseDialogueForTTS — 角色名不得被朗讀', () => {
  it('整份逐字稿的朗讀文字完全不含角色標籤', () => {
    const spoken = spokenTexts(PRODUCTION_TRANSCRIPT).join(' ');

    expect(spoken).not.toMatch(/\blibrarian\b/i);
    expect(spoken).not.toMatch(/\bvisitor\b/i);
    expect(spoken).toContain('Welcome to Eastside Library.');
    expect(spoken).toContain('We close at half past five on Saturdays');
  });

  it('單行逐字稿（行內 Librarian:/Visitor:）切出每個話輪且不殘留角色名', () => {
    const segments = parseDialogueForTTS(PRODUCTION_TRANSCRIPT);

    expect(segments).toHaveLength(5);
    for (const segment of segments) {
      expect(segment.text).not.toMatch(/librarian|visitor/i);
    }
    expect(segments[0].text).toBe('Welcome to Eastside Library. Are you here to join?');
    expect(segments[1].text).toBe('Yes, please. I would like a membership card for my daughter, she is nine.');
    // 兩個角色 → 兩把不同聲音（女／男），對話不得退化成單一 voice
    expect(new Set(segments.map((s) => s.speaker)).size).toBe(2);
    expect(segments[0].speaker).toBe('woman');
    expect(segments[1].speaker).toBe('man');
    // 同一角色在整個對話中固定同一把聲音
    expect(segments[2].speaker).toBe('woman');
    expect(segments[4].speaker).toBe('woman');
  });

  it('換行分隔的任意角色名同樣被剝離（並固定聲音）', () => {
    const segments = parseDialogueForTTS(
      ['Librarian: Good morning.', 'Visitor: Good morning to you too.'].join('\n'),
    );

    expect(segments).toEqual([
      { speaker: 'woman', text: 'Good morning.' },
      { speaker: 'man', text: 'Good morning to you too.' },
    ]);
  });

  it('全大寫角色名（NARRATOR/RECEPTIONIST）即使只出現一次也是標籤', () => {
    const segments = parseDialogueForTTS(
      [
        'NARRATOR: Section 1. You will hear a conversation.',
        'RECEPTIONIST: How can I help you today?',
      ].join('\n'),
    );

    expect(segments).toEqual([
      { speaker: 'woman', text: 'Section 1. You will hear a conversation.' },
      { speaker: 'man', text: 'How can I help you today?' },
    ]);
  });

  it('容忍 markdown／括號裝飾的標籤（**Man:**、[Speaker 1]:）', () => {
    const segments = parseDialogueForTTS(
      ['**Man:** Could I have your name?', '[Woman 1]: Certainly, it is Ms Lee.'].join('\n'),
    );

    expect(segments).toEqual([
      { speaker: 'man', text: 'Could I have your name?' },
      { speaker: 'woman', text: 'Certainly, it is Ms Lee.' },
    ]);
  });

  it('只有標籤、沒有台詞的行整行略過（不朗讀角色名）', () => {
    const segments = parseDialogueForTTS(['Man:', 'Woman: Hello, how are you?', 'Man: Fine.'].join('\n'));

    expect(segments).toEqual([
      { speaker: 'woman', text: 'Hello, how are you?' },
      { speaker: 'man', text: 'Fine.' },
    ]);
  });

  it('正文連接詞不視為角色（However:/Note: 必須保留在台詞內）', () => {
    const segments = parseDialogueForTTS(
      ['However: the price rises each year.', 'However: the discount still applies.'].join('\n'),
    );

    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('However: the price rises each year.');
    expect(segments[1].text).toBe('However: the discount still applies.');
  });

  it('沒有角色標籤的篇章維持舊行為（逐行、預設女聲）', () => {
    const segments = parseDialogueForTTS('First line.\nSecond line.');

    expect(segments).toEqual([
      { speaker: 'woman', text: 'First line.' },
      { speaker: 'woman', text: 'Second line.' },
    ]);
  });

  it('已知角色仍使用固定聲音（Woman/Man/Boy/Girl 不受輪替影響）', () => {
    const segments = parseDialogueForTTS(
      ['Woman: Good morning.', 'Man: Good morning.', 'Boy: Hello.', 'Girl: Hi.'].join('\n'),
    );

    expect(segments.map((s) => s.speaker)).toEqual(['woman', 'man', 'boy', 'girl']);
  });
});

describe('synthesizeSpeech — 送往 TTS 的文字不得包含角色標籤', () => {
  beforeEach(() => {
    mocks.synthesizeSpeech.mockReset();
    mocks.synthesizeSpeech.mockImplementation(() =>
      Promise.resolve([{ audioContent: Buffer.alloc(8, 0x11) }]),
    );
  });

  function sentInputs(): string[] {
    return mocks.synthesizeSpeech.mock.calls.map((call) => {
      const input = call[0].input as { text?: string; ssml?: string };
      return input.ssml ?? input.text ?? '';
    });
  }

  it('正式環境逐字稿：每個話輪各合成一次，且沒有任何請求含角色名', async () => {
    await synthesizeSpeech({ text: PRODUCTION_TRANSCRIPT, multiSpeaker: true });

    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(5);
    for (const sent of sentInputs()) {
      expect(sent).not.toMatch(/librarian|visitor/i);
    }
    const voices = new Set(mocks.synthesizeSpeech.mock.calls.map((call) => call[0].voice.name));
    expect(voices.size).toBe(2); // 女聲 + 男聲
  });
});
