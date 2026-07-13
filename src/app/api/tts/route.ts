// ============================================
// POST /api/tts — Google Cloud Text-to-Speech
// ============================================
// 接收文字，回傳合成語音 MP3
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech } from '@/lib/tts-service';

export const runtime = 'nodejs';
export const maxDuration = 60; // 多人對話需要多次 API call，給充足時間

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.text) {
      return NextResponse.json(
        { error: 'Missing required field: text' },
        { status: 400 }
      );
    }

    const {
      text,
      voiceName,
      voiceTier = 'default',
      speakingRate = 1.0,
      multiSpeaker = false,  // 預設純文字模式：前端已預處理 text，server 不自行解析 speaker
      audioEncoding = 'MP3',
    } = body;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text must be a non-empty string' },
        { status: 400 }
      );
    }

    // 限制文字長度（避免濫用）
    const MAX_CHARS = 5000;
    const trimmedText = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

    if (process.env.NODE_ENV === 'development') {
      console.log('[TTS API] Request:', {
        textLen: trimmedText.length,
        textPreview: trimmedText.slice(0, 60),
        multiSpeaker,
        voiceTier,
        speakingRate,
      });
    }

    const result = await synthesizeSpeech({
      text: trimmedText,
      voiceName,
      voiceTier: ['default', 'wavenet', 'neural'].includes(voiceTier) ? voiceTier : 'default',
      speakingRate: Math.min(Math.max(speakingRate, 0.25), 4.0), // clamp 0.25-4.0
      multiSpeaker: Boolean(multiSpeaker),
      audioEncoding: ['MP3', 'OGG_OPUS', 'LINEAR16'].includes(audioEncoding) ? audioEncoding : 'MP3',
    });

    return new NextResponse(new Uint8Array(result.audioContent), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(result.audioContent.length),
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-TTS-Length': String(result.audioContent.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown TTS error';
    console.error('[TTS API] Synthesis failed:', message);

    // 判斷是否為憑證問題
    if (message.includes('unavailable') || message.includes('service account')) {
      return NextResponse.json(
        { error: 'TTS service not configured. Check GCP service account.', detail: message },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'TTS synthesis failed', detail: message },
      { status: 500 }
    );
  }
}

// OPTIONS: CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
