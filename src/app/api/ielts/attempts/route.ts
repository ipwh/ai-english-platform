// ============================================
// API: /api/ielts/attempts — start an attempt / list own attempts
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { startIeltsAttempt } from '@/modules/ielts';
import { getIeltsProgress } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };

// POST /api/ielts/attempts — body: { testId }
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-attempts:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as { testId?: string };
    if (!body.testId || typeof body.testId !== 'string') {
      return NextResponse.json({ error: 'testId is required' }, { status: 400 });
    }
    const result = await startIeltsAttempt({ userId: authResult.userId, testId: body.testId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ attempt: result.data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/ielts/attempts — own attempt history (display list)
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  try {
    const progress = await getIeltsProgress(authResult.userId);
    return NextResponse.json({ attempts: progress.recentAttempts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
