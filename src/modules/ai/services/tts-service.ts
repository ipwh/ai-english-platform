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

const SPEAKER_LINE_RE = /^(Woman|Man|Boy|Girl)\s*[:：\-–—]\s*(.+)$/i;

/** Catch abbreviated labels (W:, M:, B:, G:) that slipped past normalization */
const ABBREVIATED_SPEAKER_RE = /^([WwMmBbGg])\s*[:：\-–—]\s*(.+)$/;

/** Expand single-letter abbreviation to full speaker label */
const SPEAKER_ABBREV_MAP: Record<string, 'woman' | 'man' | 'boy' | 'girl'> = {
  w: 'woman', m: 'man', b: 'boy', g: 'girl',
};

export function parseDialogueForTTS(text: string): DialogueSegment[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const segments: DialogueSegment[] = [];

  for (const line of lines) {
    const match = line.match(SPEAKER_LINE_RE);
    if (match) {
      const speaker = match[1].toLowerCase() as 'woman' | 'man' | 'boy' | 'girl';
      const spokenText = match[2].trim();
      segments.push({ speaker, text: spokenText });
    } else {
      // Check for abbreviated labels (W:, M:, B:, G:) that escaped normalization
      const abbrevMatch = line.match(ABBREVIATED_SPEAKER_RE);
      if (abbrevMatch) {
        const speaker = SPEAKER_ABBREV_MAP[abbrevMatch[1].toLowerCase()] || 'woman';
        const spokenText = abbrevMatch[2].trim();
        segments.push({ speaker, text: spokenText });
      } else {
        // 沒有角色標籤的行 → 用預設女聲
        segments.push({ speaker: 'woman', text: line });
      }
    }
  }

  return segments;
}

// ============================================
// 核心合成函數
// ============================================

/**
 * 生成靜音 MP3 buffer（用於多 speaker 段落間的停頓）
 * 使用已知有效的 silent MP3 frame（128kbps, 44100Hz, stereo, ~26ms/frame）
 */
function generateSilenceMP3(durationMs: number): Buffer {
  // Valid silent MPEG Audio Layer III frame (128kbps, 44100Hz, stereo, no CRC)
  // Each frame = 417 bytes for 26.122ms of audio
  const SILENT_FRAME = Buffer.from([
    0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  const framesPerMs = 1 / 26.122;
  const frameCount = Math.max(1, Math.round(durationMs * framesPerMs));
  const buffers: Buffer[] = [];
  for (let i = 0; i < frameCount; i++) {
    buffers.push(SILENT_FRAME);
  }
  return Buffer.concat(buffers);
}

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
  encoding: 'MP3' | 'OGG_OPUS' | 'LINEAR16'
): Promise<Buffer> {
  const encodingMap = {
    MP3: 'MP3' as const,
    OGG_OPUS: 'OGG_OPUS' as const,
    LINEAR16: 'LINEAR16' as const,
  };

  // 短文本（<200 chars）使用 SSML 以獲得更好的 prosody 控制
  // 長文本使用純文字（更穩定，避免 SSML parse 錯誤）
  const useSSML = text.length < 200 && !text.includes('<') && !text.includes('&');

  const input: Record<string, unknown> = useSSML
    ? {
        ssml: wrapSSML(text, voiceName, speakingRate),
      }
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

/** SSML 包裝：加入 prosody 控制以提升自然度 */
function wrapSSML(text: string, voiceName: string, speakingRate: number): string {
  // Escape XML special chars
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const rate = Math.round(speakingRate * 100) / 100;
  return `<speak>
  <voice name="${voiceName}">
    <prosody rate="${rate}">
      ${escaped}
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
  maxRetries = 3
): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await synthesizeSegment(client, text, voiceName, speakingRate, encoding);
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
  // 使用不同 voice 為不同角色合成，並加入短暫停頓
  // ============================================
  if (multiSpeaker) {
    const segments = parseDialogueForTTS(text);
    if (segments.length === 0) {
      // 無法解析對話段落 → fallback 單人模式
      logger.warn({ module: 'tts-service' }, 'Multi-speaker mode: no dialogue segments found, falling back to single-speaker');
      return synthesizeSpeech({ ...options, multiSpeaker: false });
    }

    logger.debug({ module: 'tts-service', segmentCount: segments.length }, 'Multi-speaker mode segments');

    // 逐段合成（帶重試）
    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const voiceEntry = TTS_VOICES[seg.speaker];
      const segVoiceName = voiceEntry[voiceTier] ?? voiceEntry.default;

      // Debug: 顯示實際送到 TTS 的文字（確認 label 已被剝離）
      logger.debug({ module: 'tts-service', segmentIndex: i + 1, totalSegments: segments.length, speaker: seg.speaker, voice: segVoiceName, textPreview: seg.text.slice(0, 60) }, 'Synthesizing segment');

      try {
        // 每段之間插入短暫停頓（約 0.2s，讓對話自然但不至於有明顯空白）
        if (i > 0) {
          audioBuffers.push(generateSilenceMP3(200));
        }

        const segBuffer = await synthesizeWithRetry(
          client, seg.text, segVoiceName, speakingRate, audioEncoding, 3
        );
        audioBuffers.push(segBuffer);
      } catch (err) {
        logger.error({ module: 'tts-service', segmentIndex: i + 1, error: (err as Error).message }, 'Segment synthesis failed after retries');
        // 單段失敗不中斷整個流程，用靜音墊檔
        // 但若第一段就失敗則拋出錯誤
        if (i === 0) throw err;
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
