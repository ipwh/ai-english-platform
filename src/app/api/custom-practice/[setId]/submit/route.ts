// ============================================
// API: POST /api/custom-practice/[setId]/submit
// ============================================
// Submit answers → server-side grading → persisted results.
// The submission and its graded responses are written in ONE transaction, and
// the database's unique index on the set guarantees a single submission even if
// two requests race (the loser gets 409, never a second set of marks).
//
// Failure mapping: 400 malformed/empty answers · 401 unauthenticated ·
// 404 not found / not the owner · 409 already submitted · 429 rate limited ·
// 500 persistence failure (nothing is written — no partial submission).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';
import { CustomPracticeError, submitCustomPracticeSet } from '@/modules/custom-practice';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

export async function POST(request: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `custom-practice-submit:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { setId } = await params;

  let body: { answers?: unknown };
  try {
    body = (await request.json()) as { answers?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.answers !== 'object' || body.answers === null || Array.isArray(body.answers)) {
    return NextResponse.json({ error: 'answers must be an object of questionId → answer' }, { status: 400 });
  }

  const answers = Object.fromEntries(
    Object.entries(body.answers as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value),
    ])
  );

  try {
    const results = await submitCustomPracticeSet({
      setId,
      ownerUserId: authResult.userId,
      answers,
    });
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof CustomPracticeError) {
      switch (error.code) {
        case 'NOT_FOUND':
          return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
        case 'ALREADY_SUBMITTED':
          return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
        case 'NO_ANSWERS':
        case 'INVALID_REQUEST':
          return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 400 });
        default:
          break;
      }
    }
    logger.error(
      { module: 'custom-practice', error: error instanceof Error ? error.message : String(error) },
      'custom practice submission failed'
    );
    return NextResponse.json({ error: 'Your answers could not be saved. Nothing was marked — please try again.' }, { status: 500 });
  }
}
