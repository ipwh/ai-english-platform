// ============================================
// API: POST /api/ielts/mistakes/explain — AI explanation of a wrong answer
// ============================================
// Advisory only: the mark was already computed by the deterministic scorer and
// can never change here. Ownership + submission state are enforced in the
// service; only responses scored `incorrect` are eligible.
//
// Failure mapping: budget → 503 · timeout → 504 · provider → 502 ·
// invalid/filtered → 422 · ownership → 403 · state → 409 · missing → 404.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { isBudgetExceededError } from '@/modules/ai';
import { explainIeltsMistake } from '@/modules/ielts';

export const runtime = 'nodejs';
export const maxDuration = 90;

const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
const MAX_ID_CHARS = 64;

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-mistake-explain:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as {
      attemptId?: unknown;
      questionId?: unknown;
      language?: unknown;
    };
    if (
      typeof body.attemptId !== 'string' ||
      body.attemptId.length === 0 ||
      body.attemptId.length > MAX_ID_CHARS ||
      typeof body.questionId !== 'string' ||
      body.questionId.length === 0 ||
      body.questionId.length > MAX_ID_CHARS
    ) {
      return NextResponse.json(
        { error: 'attemptId and questionId are required' },
        { status: 400 },
      );
    }
    const language = body.language === 'zh' ? 'zh' : 'en';

    const outcome = await explainIeltsMistake({
      userId: authResult.userId,
      attemptId: body.attemptId,
      questionId: body.questionId,
      language,
    });
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error, message: outcome.message },
        { status: outcome.status },
      );
    }
    return NextResponse.json({ explanation: outcome.data });
  } catch (err) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: 'AI_BUDGET_EXHAUSTED', message: (err as Error).message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
