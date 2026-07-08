// ============================================
// POST /api/tts — Microsoft Edge TTS（完全免費，無需 API key）
// 300+ 神經網路語音，支援速率/音調控制
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { tts, getVoices } from 'edge-tts/out/index.js';

const DEFAULT_VOICES: Record<string, string> = {
  'en': 'en-US-AriaNeural',
  'en-US': 'en-US-AriaNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'zh': 'zh-HK-HiuMaanNeural',
  'zh-HK': 'zh-HK-HiuMaanNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
};

function mapSpeedToRate(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

let cachedVoices: { ShortName: string; Locale: string; Gender: string }[] | null = null;

async function getAvailableVoices() {
  if (!cachedVoices) {
    try { cachedVoices = await getVoices(); } catch { cachedVoices = []; }
  }
  return cachedVoices;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, lang = 'en', voice, speed = 1.0 } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: '請提供文字內容' }, { status: 400 });
    }

    let voiceName = voice || DEFAULT_VOICES[lang] || DEFAULT_VOICES['en'];

    // Validate voice exists
    const availableVoices = await getAvailableVoices();
    if (availableVoices.length > 0 && !availableVoices.find(v => v.ShortName === voiceName)) {
      const fallback = availableVoices.find(v => v.Locale.startsWith(lang));
      if (fallback) voiceName = fallback.ShortName;
    }

    const rate = mapSpeedToRate(speed);
    console.log(`[tts] voice=${voiceName} rate=${rate} chars=${text.length}`);

    const mp3Buffer = await tts(text, { voice: voiceName, rate, volume: '+0%', pitch: '+0Hz' });
    const base64 = Buffer.from(mp3Buffer).toString('base64');

    return NextResponse.json({ audioUrl: `data:audio/mp3;base64,${base64}`, voice: voiceName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    console.error('[tts] Error:', msg);
    return NextResponse.json({ error: msg, fallback: true }, { status: 500 });
  }
}
