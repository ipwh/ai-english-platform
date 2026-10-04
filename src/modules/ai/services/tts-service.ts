// ============================================
// Google Cloud Text-to-Speech Library
// 使用官方 @google-cloud/text-to-speech SDK
// ============================================

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { loadServiceAccountCredentials } from '@/modules/ai/services/gcp-auth';
import { logger } from '@/shared/logger/logger';

// ============================================
// Credential / Client 管理
// ============================================

let ttsClient: TextToSpeechClient | null = null;

export async function getTTSClient(): Promise<TextToSpeechClient | null> {
  if (ttsClient) return ttsClient;

  const credentials = loadServiceAccountCredentials();
  if (!credentials) {
    logger.warn({ module: 'tts-service' }, 'No GCP service account found. Cloud TTS unavailable.');
    return null;
  }

  try {
    ttsClient = new TextToSpeechClient({
      credentials,
      projectId: (credentials as Record<string, unknown>).project_id as string,
    });

    logger.info({ module: 'tts-service' }, 'Google Cloud TTS client initialized');
    return ttsClient;
  } catch (err) {
    logger.error({ module: 'tts-service', error: (err as Error).message }, 'Failed to initialize TTS client');
    return null;
  }
}

// ============================================
// Voice 對照表 — 根據角色選擇最自然的語音
// ============================================

export const TTS_VOICES = {
  // 女性
  woman: {
    default: 'en-US-Standard-H',     // 自然女聲（免費層可用）
    wavenet: 'en-US-Wavenet-H',       // WaveNet 女聲（付費）
    neural: 'en-US-Neural2-H',        // Neural2 女聲
  },
  female: {
    default: 'en-US-Standard-H',
    wavenet: 'en-US-Wavenet-H',
    neural: 'en-US-Neural2-H',
  },
  // 男性
  man: {
    default: 'en-US-Standard-D',     // 自然男聲（免費層可用）
    wavenet: 'en-US-Wavenet-D',       // WaveNet 男聲（付費）
    neural: 'en-US-Neural2-D',        // Neural2 男聲
  },
  male: {
    default: 'en-US-Standard-D',
    wavenet: 'en-US-Wavenet-D',
    neural: 'en-US-Neural2-D',
  },
  // 青少年
  boy: {
    default: 'en-US-Standard-B',     // 男童聲
    wavenet: 'en-US-Standard-B',      // 無專用 WaveNet，fallback 標準
    neural: 'en-US-Neural2-I',        // Neural2 男聲
  },
  girl: {
    default: 'en-US-Standard-C',     // 女童聲
    wavenet: 'en-US-Standard-C',      // 無專用 WaveNet，fallback 標準
    neural: 'en-US-Neural2-F',        // Neural2 女聲
  },
} as const;

// ============================================
// 將 listeningContent 解析為對話段落
// ============================================

export interface DialogueSegment {
  speaker: 'woman' | 'man' | 'boy' | 'girl';
  text: string;
}

type DialogueSpeaker = DialogueSegment['speaker'];

/** 未知角色取用語音的輪替順序（依首次出現順序取未被佔用者）。 */
const VOICE_ROTATION: readonly DialogueSpeaker[] = ['woman', 'man', 'boy', 'girl'];

/** 固定語音標籤：性別／年齡有意義，亦含單字母縮寫 W/M/B/G。 */
const FIXED_LABELS: Record<string, DialogueSpeaker> = {
  w: 'woman', woman: 'woman', female: 'woman', lady: 'woman',
  m: 'man', man: 'man', male: 'man',
  b: 'boy', boy: 'boy',
  g: 'girl', girl: 'girl',
};

/**
 * 角色詞：即使只出現一次也必然是講者標籤。
 * 2026-10-04 事故：正式環境 IELTS 起始卷的講者寫成 "Librarian:"／"Visitor:"，
 * 舊碼只認 Woman/Man/Boy/Girl，於是整句連角色名一併朗讀（且全用同一把女聲）。
 */
const SPEAKER_ROLE_WORDS = new Set([
  'narrator', 'speaker', 'presenter', 'host', 'announcer', 'guide', 'instructor',
  'examiner', 'interviewer', 'receptionist', 'librarian', 'clerk', 'assistant', 'agent',
  'officer', 'manager', 'secretary', 'waiter', 'waitress', 'shopkeeper', 'driver',
  'passenger', 'student', 'teacher', 'tutor', 'lecturer', 'professor', 'doctor', 'nurse',
  'patient', 'customer', 'visitor', 'caller', 'applicant', 'colleague', 'classmate',
  'neighbour', 'neighbor', 'tourist', 'friend', 'coach', 'supervisor', 'technician',
  'adviser', 'advisor', 'coordinator', 'organiser', 'organizer', 'volunteer', 'member',
  'guest', 'resident', 'owner', 'employer', 'employee', 'client', 'candidate',
  'chair', 'chairperson', 'moderator', 'panelist', 'spokesperson', 'representative',
]);

/** 看似標籤、實為話語本身的連接詞／標記 —— 永不當作講者，否則會吃掉正文。 */
const NON_SPEAKER_MARKERS = new Set([
  'however', 'therefore', 'moreover', 'furthermore', 'firstly', 'secondly', 'thirdly',
  'finally', 'note', 'notes', 'question', 'answer', 'example', 'tip', 'summary',
  'warning', 'conclusion', 'importantly', 'interestingly', 'remember',
]);

/**
 * 一個標籤最多 3 個詞（詞間只允許空格／Tab —— 不得跨行）。
 * 詞內不得含句點：否則 "… she is nine. Librarian:" 會被貪婪匹配成
 * "is nine. Librarian" 這個假標籤，吃掉上一句正文。縮寫（Ms.／Dr.）以
 * 專用前綴支援。
 */
const LABEL_WORDS =
  String.raw`(?:[A-Za-z]{1,3}\.[ \t]+)?[A-Za-z][A-Za-z0-9&'’\-]*(?:[ \t]+[A-Za-z0-9&'’\-]+){0,2}`;
const LABEL_DECORATION = String.raw`(?:\*\*|__|\*|_|\[|\()?`;
const LABEL_DECORATION_END = String.raw`(?:\]|\))?`;
const LABEL_DECORATION_TRAIL = String.raw`(?:\*\*|__|\*|_)?`;
const LABEL_SEPARATOR = String.raw`[:：\-–—]`;

/**
 * 行首（或空白／換行後）的講者標籤，容忍 markdown／括號裝飾，後接冒號或破折號。
 * 標籤本身保留在輸出中，交由行解析決定角色（避免切段時遺失角色身份）。
 */
const LABEL_TOKEN_RE = new RegExp(
  `(^|\\s)${LABEL_DECORATION}[ \\t]*(${LABEL_WORDS})[ \\t]*${LABEL_DECORATION_END}[ \\t]*${LABEL_DECORATION_TRAIL}[ \\t]*${LABEL_SEPARATOR}`,
  'g',
);

/** 已切成單行的講者標籤（保留標籤後的台詞）。 */
const LINE_LABEL_RE = new RegExp(
  `^${LABEL_DECORATION}[ \\t]*(${LABEL_WORDS})[ \\t]*${LABEL_DECORATION_END}[ \\t]*${LABEL_DECORATION_TRAIL}[ \\t]*${LABEL_SEPARATOR}\\s*(.*)$`,
);

interface LabelHit {
  /** 正規化後的標籤（小寫、去句點、壓縮空白）——同一角色的識別鍵 */
  key: string;
  /** 原始標籤文字（用於全大寫判斷） */
  label: string;
  /** 標籤前的邊界字元位置（空白或字串開頭） */
  boundaryStart: number;
}

function normalizeLabel(raw: string): string {
  return raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/**
 * 標籤的偏好聲音：完全符合已知標籤（Man）或首詞為已知性別／年齡詞
 * （Woman 1 → woman、Man B → man）時沿用該聲音，否則回 undefined（交由輪替決定）。
 */
function preferredSpeaker(key: string): DialogueSpeaker | undefined {
  return FIXED_LABELS[key] ?? FIXED_LABELS[key.split(' ')[0]];
}

/**
 * 是否為講者標籤。以「已知角色詞／性別標籤／全大寫」或「重複出現且首字母大寫」
 * 判定 —— 正文中偶然出現的 "However:"／"Note:" 不會被誤認為角色（避免吃掉台詞），
 * 而重複出現的任意角色名（Librarian／Visitor）必定是角色。
 */
function isSpeakerLabel(label: string, key: string, counts: Map<string, number>): boolean {
  if (NON_SPEAKER_MARKERS.has(key)) return false;
  if (preferredSpeaker(key)) return true;
  if (SPEAKER_ROLE_WORDS.has(key.split(' ')[0])) return true;
  if (label.length > 1 && label === label.toUpperCase() && /[A-Z]/.test(label)) return true;
  // 其他人名：只有重複出現（且首字母大寫）才當作角色，單次出現視為正文。
  return (counts.get(key) ?? 0) >= 2 && /^[A-Z]/.test(label);
}

function collectLabelHits(text: string): LabelHit[] {
  const hits: LabelHit[] = [];
  LABEL_TOKEN_RE.lastIndex = 0;
  for (const match of text.matchAll(LABEL_TOKEN_RE)) {
    const boundary = match[0].slice(0, match[1].length);
    hits.push({
      key: normalizeLabel(match[2]),
      label: match[2],
      boundaryStart: (match.index ?? 0) + boundary.length,
    });
  }
  return hits;
}

/**
 * 將對話文字解析為「角色 + 台詞」段落。
 * - 角色標籤永不進入合成文字（行內標籤 "…join? Visitor: Yes" 亦會被切成新行）
 * - 同一角色固定同一把聲音；未知角色依首次出現順序輪替（女/男/童）
 * - 只有標籤、沒有台詞的行整行略過（不再朗讀角色名）
 * - 沒有可辨識標籤 → 逐行回退預設女聲（維持舊行為，供單人篇章使用）
 */
export function parseDialogueForTTS(text: string): DialogueSegment[] {
  if (!text) return [];

  const hits = collectLabelHits(text);
  const counts = new Map<string, number>();
  for (const hit of hits) counts.set(hit.key, (counts.get(hit.key) ?? 0) + 1);

  const qualifying = hits.filter((hit) => isSpeakerLabel(hit.label, hit.key, counts));

  // 角色 → 語音（首次出現順序；已知標籤用固定聲音，未知標籤取未被佔用者）
  const speakerOf = new Map<string, DialogueSpeaker>();
  const used = new Set<DialogueSpeaker>();
  for (const hit of qualifying) {
    if (speakerOf.has(hit.key)) continue;
    const preferred = preferredSpeaker(hit.key);
    const speaker =
      preferred && !used.has(preferred)
        ? preferred
        : VOICE_ROTATION.find((voice) => !used.has(voice)) ?? preferred ?? 'woman';
    speakerOf.set(hit.key, speaker);
    used.add(speaker);
  }

  // 行內標籤 → 行首（標籤保留，交由下方逐行解析決定角色）
  let normalized = text;
  if (qualifying.length > 0) {
    let out = '';
    let cursor = 0;
    for (const hit of qualifying) {
      if (hit.boundaryStart < cursor) continue;
      out += `${text.slice(cursor, hit.boundaryStart)}\n`;
      cursor = hit.boundaryStart;
    }
    normalized = out + text.slice(cursor);
  }

  const segments: DialogueSegment[] = [];
  let lastSpeaker: DialogueSpeaker | null = null;
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(LINE_LABEL_RE);
    if (match && isSpeakerLabel(match[1], normalizeLabel(match[1]), counts)) {
      const key = normalizeLabel(match[1]);
      const speaker = speakerOf.get(key) ?? 'woman';
      lastSpeaker = speaker;
      // 標籤後的 markdown 裝飾（**Man:** 的收尾 **）不得殘留在台詞中
      const body = match[2].trim().replace(/^[*_`~]{1,3}\s*/, '').trim();
      if (body) segments.push({ speaker, text: body }); // 只有標籤的行：靜音，不朗讀角色名
      continue;
    }

    segments.push({ speaker: lastSpeaker ?? 'woman', text: line });
  }

  return segments;
}

// ============================================
// 核心合成函數
// ============================================

/**
 * 段落之間的停頓（毫秒）— 由 SSML `<break>` 在「該段落自己的合成請求」內產生。
 *
 * ⚠️ 切勿自行拼接偽造的靜音 MP3 frame。舊做法塞入的是 MPEG1 / 128kbps / 44100Hz / stereo
 * 且長度錯誤（420 bytes，標頭宣稱 417 bytes）的 frame，而 Google 回傳的是
 * MPEG2 / 24000Hz / mono。格式不一致令 Chromium 解碼器在**第一段之後**丟出
 * MEDIA_ERR_DECODE（code 3）並停止播放（2026-09-17 修復）。
 * 改用 SSML break 後，停頓同樣由 Google 編碼器輸出，必與相鄰段落格式一致。
 */
const INTER_SEGMENT_PAUSE_MS = 200;

/**
 * Google Cloud TTS 的 SSML 輸入上限為 5000 bytes。
 * 超過此安全邊界時放棄 SSML（連帶放棄段前停頓），確保合成不會失敗。
 */
const SSML_BYTE_LIMIT = 4500;

export interface SynthesizeOptions {
  text: string;
  voiceName?: string;
  voiceTier?: 'default' | 'wavenet' | 'neural';
  speakingRate?: number;
  /** 是否使用多人對話模式（分段合成 + MP3 拼接） */
  multiSpeaker?: boolean;
  /** 輸出音訊編碼（多人模式固定用 MP3） */
  audioEncoding?: 'MP3' | 'OGG_OPUS' | 'LINEAR16';
}

export interface SynthesizeResult {
  audioContent: Buffer;
  mimeType: string;
}

/**
 * 單段語音合成（支援 SSML prosody + 重試機制）
 * 根據文本長度自動選擇純文字或 SSML 模式
 */
async function synthesizeSegment(
  client: TextToSpeechClient,
  text: string,
  voiceName: string,
  speakingRate: number,
  encoding: 'MP3' | 'OGG_OPUS' | 'LINEAR16',
  /** > 0 時在段落之前插入停頓（必須走 SSML，讓靜音由 Google 編碼器輸出） */
  leadingBreakMs = 0,
): Promise<Buffer> {
  const encodingMap = {
    MP3: 'MP3' as const,
    OGG_OPUS: 'OGG_OPUS' as const,
    LINEAR16: 'LINEAR16' as const,
  };

  // 短文本（<200 chars）使用 SSML 以獲得更好的 prosody 控制
  // 長文本使用純文字（更穩定，避免 SSML parse 錯誤）
  // 需要段前停頓時一律走 SSML（實測：<break> 置於段落「開頭」有效，置於結尾會被裁掉）
  let useSSML = leadingBreakMs > 0 || (text.length < 200 && !text.includes('<') && !text.includes('&'));

  let ssml = '';
  if (useSSML) {
    ssml = wrapSSML(text, voiceName, speakingRate, leadingBreakMs);
    // SSML 上限 5000 bytes：超標時退回純文字（寧可少一個停頓，也不讓整段合成失敗）
    if (Buffer.byteLength(ssml, 'utf8') > SSML_BYTE_LIMIT) {
      logger.warn({ module: 'tts-service', ssmlBytes: Buffer.byteLength(ssml, 'utf8') }, 'SSML too large — falling back to plain text');
      useSSML = false;
    }
  }

  const input: Record<string, unknown> = useSSML
    ? { ssml }
    : {
        text: text,
      };

  const [response] = await client.synthesizeSpeech({
    input: input as { text: string } | { ssml: string },
    voice: {
      languageCode: 'en-US',
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: encodingMap[encoding],
      speakingRate: useSSML ? 1.0 : speakingRate, // SSML 內部控制語速
    },
  });

  if (!response.audioContent) {
    throw new Error('TTS synthesis returned empty audio content');
  }

  return response.audioContent instanceof Buffer
    ? response.audioContent
    : Buffer.from(response.audioContent as Uint8Array);
}

/** SSML 包裝：加入 prosody 控制以提升自然度，可選擇在段前加入停頓 */
function wrapSSML(text: string, voiceName: string, speakingRate: number, leadingBreakMs = 0): string {
  // Escape XML special chars
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const rate = Math.round(speakingRate * 100) / 100;
  const pause = leadingBreakMs > 0 ? `<break time="${Math.round(leadingBreakMs)}ms"/>` : '';
  return `<speak>
  <voice name="${voiceName}">
    <prosody rate="${rate}">
      ${pause}${escaped}
    </prosody>
  </voice>
</speak>`;
}

/** 帶重試機制的合成（最多 3 次，指數退避） */
async function synthesizeWithRetry(
  client: TextToSpeechClient,
  text: string,
  voiceName: string,
  speakingRate: number,
  encoding: 'MP3' | 'OGG_OPUS' | 'LINEAR16',
  maxRetries = 3,
  leadingBreakMs = 0,
): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await synthesizeSegment(client, text, voiceName, speakingRate, encoding, leadingBreakMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ module: 'tts-service', attempt, maxRetries, error: lastError.message }, 'Segment synthesis attempt failed');

      if (attempt < maxRetries) {
        // 指數退避：1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('TTS synthesis failed after all retries');
}

export async function synthesizeSpeech(options: SynthesizeOptions): Promise<SynthesizeResult> {
  const client = await getTTSClient();
  if (!client) {
    throw new Error('TTS client unavailable — no GCP service account configured');
  }

  const {
    text,
    voiceName,
    voiceTier = 'default',
    speakingRate = 1.0,
    multiSpeaker = false,
    audioEncoding = 'MP3',
  } = options;

  // ============================================
  // 多人對話模式：分段合成 + MP3 拼接
  // 使用不同 voice 為不同角色合成；段落之間的停頓由各段自己的 SSML <break> 產生，
  // 確保拼接後的位元流格式一致（見 INTER_SEGMENT_PAUSE_MS 的說明）
  // ============================================
  if (multiSpeaker) {
    const segments = parseDialogueForTTS(text);
    if (segments.length === 0) {
      // 無法解析對話段落 → fallback 單人模式
      logger.warn({ module: 'tts-service' }, 'Multi-speaker mode: no dialogue segments found, falling back to single-speaker');
      return synthesizeSpeech({ ...options, multiSpeaker: false });
    }

    logger.debug({ module: 'tts-service', segmentCount: segments.length }, 'Multi-speaker mode segments');

    // 逐段合成（帶重試 + 並行預熱以減少 sequential latency）
    const audioBuffers: Buffer[] = [];
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const voiceEntry = TTS_VOICES[seg.speaker];
      const segVoiceName = voiceEntry?.[voiceTier] ?? voiceEntry?.default;

      // If voice mapping is missing for this speaker, fall back to female voice
      if (!segVoiceName) {
        logger.warn(
          { module: 'tts-service', segmentIndex: i + 1, speaker: seg.speaker },
          'No voice mapping found for speaker — falling back to female voice',
        );
      }
      const effectiveVoice = segVoiceName || TTS_VOICES.female.default;

      // Debug: 顯示實際送到 TTS 的文字（確認 label 已被剝離）
      logger.debug({ module: 'tts-service', segmentIndex: i + 1, totalSegments: segments.length, speaker: seg.speaker, voice: effectiveVoice, textPreview: seg.text.slice(0, 60) }, 'Synthesizing segment');

      try {
        // 段前停頓由本段自己的 SSML <break> 產生（真實且格式一致的靜音）。
        // 只有「已有音訊」時才加停頓，避免音訊一開始就出現空白，也避免段落合成
        // 失敗後留下孤立空白（orphan silence）。
        const segBuffer = await synthesizeWithRetry(
          client, seg.text, effectiveVoice, speakingRate, audioEncoding, 3,
          audioBuffers.length > 0 ? INTER_SEGMENT_PAUSE_MS : 0,
        );

        audioBuffers.push(segBuffer);
        consecutiveFailures = 0; // reset on success
      } catch (err) {
        consecutiveFailures++;
        logger.error({ module: 'tts-service', segmentIndex: i + 1, speaker: seg.speaker, error: (err as Error).message, consecutiveFailures }, 'Segment synthesis failed after retries');

        // 若連續失敗超過閾值，中止整個 multi-speaker 流程
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error({ module: 'tts-service', consecutiveFailures }, 'Too many consecutive segment failures — aborting multi-speaker synthesis');
          throw new Error(`Multi-speaker TTS failed: ${consecutiveFailures} consecutive segment failures`);
        }

        // 第一段失敗 → 無法繼續（沒有音訊起點）
        if (i === 0) throw err;

        // 中間段失敗 → 跳過此段，繼續合成後續段落
        // 注意：不加入 orphan silence，避免音訊中有空白中斷
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error('All TTS segments failed to synthesize');
    }

    // 拼接所有 MP3 buffer
    const combined = Buffer.concat(audioBuffers);

    const mimeMap: Record<string, string> = {
      MP3: 'audio/mpeg',
      OGG_OPUS: 'audio/ogg; codecs=opus',
      LINEAR16: 'audio/l16',
    };

    logger.info({ module: 'tts-service', byteLength: combined.length, segmentCount: segments.length }, 'Multi-speaker synthesis complete');

    return {
      audioContent: combined,
      mimeType: mimeMap[audioEncoding] || 'audio/mpeg',
    };
  }

  // ============================================
  // 單人模式：純文字 + SSML prosody（短文本）或純文字（長文本）
  // ============================================
  const vName = voiceName || TTS_VOICES.female.default;

  const audioBuffer = await synthesizeWithRetry(
    client, text, vName, speakingRate, audioEncoding, 3
  );

  const mimeMap: Record<string, string> = {
    MP3: 'audio/mpeg',
    OGG_OPUS: 'audio/ogg; codecs=opus',
    LINEAR16: 'audio/l16',
  };

  return {
    audioContent: audioBuffer,
    mimeType: mimeMap[audioEncoding] || 'audio/mpeg',
  };
}
