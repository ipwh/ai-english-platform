// ============================================
// API: POST /api/ielts/sections/[id]/audio — platform TTS audio for listening
// ============================================
// The transcript is NEVER sent to the client before submission; instead the
// server synthesises audio from the platform-owned transcript using AI voices.
// This is explicitly NOT an official IELTS recording — clients must label it
// as a platform AI voice.
//
// If TTS is unavailable the endpoint fails with a structured 503; it never
// fakes audio.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';
import { ttsService } from '@/modules/ai';
import { getSectionTranscriptForDelivery } from '@/modules/ielts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };
const MAX_TRANSCRIPT_CHARS = 5000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-audio:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { id } = await params;
  try {
    const section = await getSectionTranscriptForDelivery(id, authResult.userId);
    if (!section.ok) return NextResponse.json({ error: section.error }, { status: section.status });

    const transcript = section.data.transcript;
    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'NO_TRANSCRIPT', message: 'This listening section has no transcript; audio cannot be delivered.' },
        { status: 422 },
      );
    }

    const text = transcript.length > MAX_TRANSCRIPT_CHARS ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) : transcript;

    const result = await ttsService.synthesizeSpeech({
      text,
      voiceTier: 'default',
      speakingRate: 1.0,
      multiSpeaker: true, // dialogue transcripts use per-speaker voices; single-speaker falls back automatically
      audioEncoding: 'MP3',
    });

    return new NextResponse(new Uint8Array(result.audioContent), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(result.audioContent.length),
        // Private cache: shared practice content, but never cached across users by proxies.
        'Cache-Control': 'private, max-age=3600',
        'X-IELTS-Audio-Provenance': section.data.provenance,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown TTS error';
    logger.error({ module: 'ielts', event: 'ielts.ai.provider_error', error: message }, 'IELTS listening audio synthesis failed');
    if (message.includes('unavailable') || message.includes('service account')) {
      return NextResponse.json(
        { error: 'TTS_UNAVAILABLE', message: 'Platform TTS is not configured; listening audio cannot be generated.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'TTS_FAILED', message }, { status: 502 });
  }
}
