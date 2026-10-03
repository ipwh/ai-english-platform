// ============================================
// API: POST /api/ielts/speaking/prepare — Speaking PREPARATION coach
// ============================================
// Generates a preparation plan / language functions / practice questions.
// There is NO Speaking score in the response — the platform does not score
// Speaking and does not simulate an examiner (product decision 2026-10-03 II).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { isBudgetExceededError } from '@/modules/ai';
import { prepareIeltsSpeaking, type IeltsSpeakingPartType } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };
const MAX_PROMPT_CHARS = 2_000;
const MAX_NOTES_CHARS = 4_000;

const VALID_PARTS: IeltsSpeakingPartType[] = ['speaking_part1', 'speaking_part2', 'speaking_part3'];

function failureStatus(code: string): number {
  switch (code) {
    case 'AI_PROVIDER_TIMEOUT':
      return 504;
    case 'AI_PROVIDER_ERROR':
      return 502;
    case 'INVALID_QUESTION':
      return 400;
    default:
      return 422; // AI_INVALID_JSON etc. — refused, never a successful empty plan
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-speaking-prep:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as {
      part?: string;
      topicPrompt?: string;
      studentNotes?: string;
      topicId?: string;
    };

    if (!body.part || !VALID_PARTS.includes(body.part as IeltsSpeakingPartType)) {
      return NextResponse.json({ error: 'part must be one of ' + VALID_PARTS.join(', ') }, { status: 400 });
    }
    if (typeof body.topicPrompt !== 'string' || body.topicPrompt.trim().length === 0) {
      return NextResponse.json({ error: 'topicPrompt is required' }, { status: 400 });
    }
    if (body.topicPrompt.length > MAX_PROMPT_CHARS) {
      return NextResponse.json({ error: `topicPrompt exceeds ${MAX_PROMPT_CHARS} characters` }, { status: 413 });
    }
    if (body.studentNotes !== undefined && typeof body.studentNotes !== 'string') {
      return NextResponse.json({ error: 'studentNotes must be a string' }, { status: 400 });
    }
    if (body.studentNotes && body.studentNotes.length > MAX_NOTES_CHARS) {
      return NextResponse.json({ error: `studentNotes exceeds ${MAX_NOTES_CHARS} characters` }, { status: 413 });
    }

    const outcome = await prepareIeltsSpeaking({
      userId: authResult.userId,
      part: body.part as IeltsSpeakingPartType,
      topicPrompt: body.topicPrompt,
      studentNotes: body.studentNotes,
      topicId: typeof body.topicId === 'string' ? body.topicId : undefined,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.failureCode, message: outcome.message, assessmentId: outcome.assessmentId },
        { status: failureStatus(outcome.failureCode) },
      );
    }

    return NextResponse.json({ preparation: outcome.result, assessmentId: outcome.assessmentId });
  } catch (err) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: 'AI_BUDGET_EXHAUSTED', message: (err as Error).message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
