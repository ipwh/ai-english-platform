// ============================================
// Google Cloud Text-to-Speech Library
// 使用官方 @google-cloud/text-to-speech SDK
// ============================================

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { GoogleAuth } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';

// ============================================
// Credential / Client 管理（與 ai-service.ts 共用模式）
// ============================================

let ttsClient: TextToSpeechClient | null = null;

function getServiceAccountCredentials(): object | null {
  // 優先級：1. env var JSON  2. env var file path  3. local file
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(credPath)) return null;
    return JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  }
  const localPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  }
  return null;
}

function getTTSScopes(): string[] {
  return ['https://www.googleapis.com/auth/cloud-platform'];
}

export async function getTTSClient(): Promise<TextToSpeechClient | null> {
  if (ttsClient) return ttsClient;

  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    console.warn('[TTS] No GCP service account found. Cloud TTS unavailable.');
    return null;
  }

  try {
    // 使用 GoogleAuth 取得 access token，然後傳給 TTS client
    const auth = new GoogleAuth({
      credentials,
      scopes: getTTSScopes(),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttsClient = new TextToSpeechClient({
      auth: auth as any,
      projectId: (credentials as Record<string, unknown>).project_id as string,
    });

    console.log('[TTS] Google Cloud TTS client initialized');
    return ttsClient;
  } catch (err) {
    console.error('[TTS] Failed to initialize TTS client:', err);
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
      // 沒有角色標籤的行 → 用預設女聲
      segments.push({ speaker: 'woman', text: line });
    }
  }

  return segments;
}

// ============================================
// 核心合成函數
// ============================================

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
 * 單段語音合成（純文字模式，不用 SSML）
 * 最可靠的方式：直接送純文字 + voice name，不做 SSML 包裝
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

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: encodingMap[encoding],
      speakingRate,
    },
  });

  if (!response.audioContent) {
    throw new Error('TTS synthesis returned empty audio content');
  }

  return response.audioContent instanceof Buffer
    ? response.audioContent
    : Buffer.from(response.audioContent as Uint8Array);
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
  // 完全捨棄 SSML <voice> 切換（不可靠），改用逐段合成
  // ============================================
  if (multiSpeaker) {
    const segments = parseDialogueForTTS(text);
    if (segments.length === 0) {
      throw new Error('No dialogue segments found in text');
    }

    console.log(`[TTS] Multi-speaker mode: ${segments.length} segments`);

    // 逐段合成
    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const voiceEntry = TTS_VOICES[seg.speaker];
      const segVoiceName = voiceEntry[voiceTier] ?? voiceEntry.default;

      console.log(`[TTS]   Segment ${i + 1}/${segments.length}: speaker=${seg.speaker}, voice=${segVoiceName}, text="${seg.text.slice(0, 40)}..."`);

      try {
        // 每段之間加入 0.5 秒靜音（約 500ms 的 MP3 silence）
        if (i > 0) {
          const silenceBuffer = await synthesizeSegment(
            client, ' ', segVoiceName, speakingRate, audioEncoding
          );
          // 只取前 ~1KB（近似 0.5 秒靜音），不要全段空白
          // 更好的做法是直接用 silent MP3 frame，但這個 hack 夠用
          audioBuffers.push(silenceBuffer.slice(0, Math.min(silenceBuffer.length, 2000)));
        }

        const segBuffer = await synthesizeSegment(
          client, seg.text, segVoiceName, speakingRate, audioEncoding
        );
        audioBuffers.push(segBuffer);
      } catch (err) {
        console.error(`[TTS] Segment ${i + 1} synthesis failed:`, err);
        throw err;
      }
    }

    // 拼接所有 MP3 buffer（MP3 frame 可以直接串接）
    const combined = Buffer.concat(audioBuffers);

    const mimeMap: Record<string, string> = {
      MP3: 'audio/mpeg',
      OGG_OPUS: 'audio/ogg; codecs=opus',
      LINEAR16: 'audio/l16',
    };

    return {
      audioContent: combined,
      mimeType: mimeMap[audioEncoding] || 'audio/mpeg',
    };
  }

  // ============================================
  // 單人模式：純文字直接合成（不用 SSML，最可靠）
  // ============================================
  const vName = voiceName || TTS_VOICES.female.default;

  const encodingMap = {
    MP3: 'MP3' as const,
    OGG_OPUS: 'OGG_OPUS' as const,
    LINEAR16: 'LINEAR16' as const,
  };

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: vName,
    },
    audioConfig: {
      audioEncoding: encodingMap[audioEncoding],
      speakingRate,
    },
  });

  if (!response.audioContent) {
    throw new Error('TTS synthesis returned empty audio content');
  }

  const audioBuffer = response.audioContent instanceof Buffer
    ? response.audioContent
    : Buffer.from(response.audioContent as Uint8Array);

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
