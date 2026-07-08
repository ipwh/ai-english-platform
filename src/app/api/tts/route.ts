// ============================================
// POST /api/tts — 文字轉語音（LuvVoice 優先，瀏覽器 TTS 備援）
// 使用 LuvVoice API 生成高品質 MP3 音檔
// ============================================

import { NextRequest, NextResponse } from 'next/server';

const LUVVOICE_API = 'https://luvvoice.com/api/v1/text-to-speech';

/** LuvVoice 語音 ID 對應（英語 + 粵語） */
const VOICE_MAP: Record<string, string> = {
  // 英語女聲
  'en-female': 'voice-001',  // 預設英式女聲
  'en-us-female': 'voice-002',
  'en-gb-female': 'voice-003',
  'en-au-female': 'voice-004',
  // 英語男聲
  'en-male': 'voice-005',
  'en-us-male': 'voice-006',
  'en-gb-male': 'voice-007',
  // 粵語
  'zh-HK-female': 'voice-zh-hk-001',
  'zh-HK-male': 'voice-zh-hk-002',
  // 普通話
  'zh-CN-female': 'voice-zh-001',
  'zh-CN-male': 'voice-zh-002',
};

interface TTSRequest {
  text: string;
  lang?: string;        // e.g. 'en', 'zh'
  voice?: string;       // specific voice key
  speed?: number;       // 0.5 - 2.0 (maps to LuvVoice rate: -10 to 10)
}

/**
 * 將 AudioPlayer 速度對應至 LuvVoice rate
 * LuvVoice rate: -10 (slowest) to 10 (fastest), 0 = normal
 * AudioPlayer speed: 0.75, 1.0, 1.25, 1.5
 */
function mapSpeedToRate(speed: number): number {
  // Linear mapping: speed 0.75→-5, 1.0→0, 1.25→5, 1.5→10
  return Math.round((speed - 1) * 20);
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LUVVOICE_API_KEY;
    if (!apiKey) {
      // 無 API key 時回傳 501，讓前端降級至瀏覽器 TTS
      return NextResponse.json(
        { error: 'LuvVoice API key not configured', fallback: true },
        { status: 501 }
      );
    }

    const body: TTSRequest = await request.json();
    const { text, lang = 'en', voice, speed = 1.0 } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: '請提供文字內容' }, { status: 400 });
    }

    // 限制文字長度（免費方案單次上限約 3,000 字元）
    const truncatedText = text.slice(0, 3000);

    // 選擇語音
    let voiceId: string;
    if (voice && VOICE_MAP[voice]) {
      voiceId = VOICE_MAP[voice];
    } else {
      // 根據語言選擇預設語音
      const isCantonese = lang === 'zh' || lang.startsWith('zh-HK');
      const isMandarin = lang.startsWith('zh-CN');
      if (isCantonese) voiceId = VOICE_MAP['zh-HK-female'];
      else if (isMandarin) voiceId = VOICE_MAP['zh-CN-female'];
      else voiceId = VOICE_MAP['en-female'];
    }

    const rate = mapSpeedToRate(speed);

    console.log(`[tts] Requesting LuvVoice: lang=${lang}, voice=${voiceId}, rate=${rate}, chars=${truncatedText.length}`);

    const response = await fetch(LUVVOICE_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: truncatedText,
        voice_id: voiceId,
        rate,
        pitch: 0,
        volume: 0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[tts] LuvVoice API error:', response.status, errText);

      // 401/403: API key 無效
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: 'LuvVoice API key 無效', fallback: true },
          { status: 502 }
        );
      }

      // 429: 超出額度
      if (response.status === 429) {
        return NextResponse.json(
          { error: '已超出本月 LuvVoice 免費額度', fallback: true },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `LuvVoice API 錯誤 (${response.status})`, fallback: true },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (!data.success || !data.audio_url) {
      console.error('[tts] Unexpected response:', data);
      return NextResponse.json(
        { error: 'LuvVoice 未回傳音檔', fallback: true },
        { status: 502 }
      );
    }

    // 回傳 MP3 URL 及 metadata
    return NextResponse.json({
      audioUrl: data.audio_url,
      durationMs: data.duration_ms,
      creditsUsed: data.credits_consumed,
      creditsRemaining: data.credits_remaining,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    console.error('[tts] Error:', msg);
    return NextResponse.json(
      { error: msg, fallback: true },
      { status: 500 }
    );
  }
}
