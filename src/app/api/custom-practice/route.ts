// ============================================
// API: /api/custom-practice — self-directed practice
// ============================================
// POST  → student states a learning need; the server normalizes it, generates a
//         validated exercise and returns it WITHOUT any answer key.
// GET   → the caller's own recent practice sets (metadata only; never another
//         student's data).
//
// Failure mapping (matches the house convention):
//   400 bad/ambiguous request · 401 unauthenticated · 409 already submitted ·
//   422 nothing survived generation validation · 429 rate limited ·
//   503 AI budget exhausted · 502 provider failure · 504 timeout · 500 otherwise.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { isBudgetExceededError } from '@/modules/ai';
import { logger } from '@/shared/logger/logger';
import {
  CustomPracticeError,
  generateCustomPracticeSet,
  getOwnedSet,
  listOwnSets,
  normalizePracticeRequest,
  toDeliveredSet,
} from '@/modules/custom-practice';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RATE_LIMIT = { maxRequests: 5, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `custom-practice-generate:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const normalized = normalizePracticeRequest({
    requestText: body.requestText,
    category: body.category,
    difficulty: body.difficulty,
    questionCount: body.questionCount,
    exerciseTypes: body.exerciseTypes,
  });

  if (!normalized.ok) {
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: 400 }
    );
  }

  try {
    const generated = await generateCustomPracticeSet({
      ownerUserId: authResult.userId,
      spec: normalized.spec,
    });

    const set = await getOwnedSet(generated.setId, authResult.userId);
    if (!set) {
      return NextResponse.json({ error: 'Practice set could not be loaded' }, { status: 500 });
    }

    return NextResponse.json(
      {
        set: toDeliveredSet(set, false),
        meta: {
          requestedCount: generated.requestedCount,
          deliveredCount: generated.deliveredCount,
          shortfall: generated.shortfall,
          droppedCount: generated.droppedCount,
          rejectedByVerification: generated.rejectedByVerification,
          regenerationRounds: generated.regenerationRounds,
          interpretation: normalized.spec.interpretation,
          promptVersion: generated.promptVersion,
          verificationPromptVersion: generated.verificationPromptVersion,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof CustomPracticeError) {
      if (error.code === 'GENERATION_FAILED') {
        return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 422 });
      }
      if (error.code === 'INVALID_REQUEST' || error.code === 'CATEGORY_AMBIGUOUS') {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
    }
    if (isBudgetExceededError(error)) {
      return NextResponse.json({ error: 'AI is unavailable right now (budget exhausted). Please try later.' }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ module: 'custom-practice', error: message }, 'custom practice generation failed');
    if (/timeout|timed out/i.test(message)) {
      return NextResponse.json({ error: 'The exercise took too long to generate. Please try again.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'The exercise could not be generated. Please try again.' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  try {
    const sets = await listOwnSets(authResult.userId);
    return NextResponse.json({
      sets: sets.map(set => ({
        id: set.id,
        objective: set.objective,
        category: set.category,
        difficulty: set.difficulty,
        questionCount: set.questionCount,
        createdAt: set.createdAt.toISOString(),
        submitted: set.submission !== null,
        awardedMarks: set.submission?.awardedMarks ?? null,
        totalMarks: set.submission?.totalMarks ?? null,
      })),
    });
  } catch (error) {
    logger.error(
      { module: 'custom-practice', error: error instanceof Error ? error.message : String(error) },
      'custom practice list failed'
    );
    return NextResponse.json({ error: 'Could not load your practice sets.' }, { status: 500 });
  }
}
