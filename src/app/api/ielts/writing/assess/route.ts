// ============================================
// API: POST /api/ielts/writing/assess — AI-assisted writing assessment
// ============================================
// Produces an AI ESTIMATE with criterion-level evidence. Never an official
// score, never a certified-examiner equivalence claim. Failures are typed and
// surfaced as non-2xx (never as a successful assessment).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { isBudgetExceededError } from '@/modules/ai';
import { assessIeltsWriting, getIeltsAttemptDetail, type IeltsWritingTaskType } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 8, windowMs: 60_000 };
const MAX_ESSAY_CHARS = 12_000;

const VALID_TASKS: IeltsWritingTaskType[] = [
  'academic_task1',
  'academic_task2',
  'general_task1',
  'general_task2',
];

function failureStatus(code: string): number {
  switch (code) {
    case 'AI_PROVIDER_TIMEOUT':
      return 504;
    case 'AI_PROVIDER_ERROR':
      return 502;
    case 'INVALID_QUESTION':
      return 400;
    default:
      return 422; // TASK_NOT_ANSWERED, AI_INVALID_JSON, AI_MISSING_CRITERION, AI_MISSING_EVIDENCE, AI_UNSUPPORTED_BAND, AI_EVIDENCE_MISMATCH…
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-writing-assess:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as {
      taskType?: string;
      taskPrompt?: string;
      essay?: string;
      attemptId?: string;
    };

    if (!body.taskType || !VALID_TASKS.includes(body.taskType as IeltsWritingTaskType)) {
      return NextResponse.json({ error: 'taskType must be one of ' + VALID_TASKS.join(', ') }, { status: 400 });
    }
    if (typeof body.taskPrompt !== 'string' || body.taskPrompt.trim().length === 0) {
      return NextResponse.json({ error: 'taskPrompt is required' }, { status: 400 });
    }
    if (typeof body.essay !== 'string' || body.essay.trim().length === 0) {
      return NextResponse.json({ error: 'essay is required' }, { status: 400 });
    }
    if (body.essay.length > MAX_ESSAY_CHARS) {
      return NextResponse.json({ error: `essay exceeds ${MAX_ESSAY_CHARS} characters` }, { status: 413 });
    }

    let attemptId: string | null = null;
    if (body.attemptId) {
      const attempt = await getIeltsAttemptDetail(body.attemptId);
      if (!attempt.ok) return NextResponse.json({ error: attempt.error }, { status: attempt.status });
      if (attempt.data.userId !== authResult.userId) {
        return NextResponse.json({ error: 'You cannot attach an assessment to this attempt' }, { status: 403 });
      }
      attemptId = body.attemptId;
    }

    const outcome = await assessIeltsWriting({
      userId: authResult.userId,
      taskType: body.taskType as IeltsWritingTaskType,
      taskPrompt: body.taskPrompt,
      essay: body.essay,
      attemptId,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.failureCode, message: outcome.message, assessmentId: outcome.assessmentId },
        { status: failureStatus(outcome.failureCode) },
      );
    }

    return NextResponse.json({ assessment: outcome.result, assessmentId: outcome.assessmentId });
  } catch (err) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: 'AI_BUDGET_EXHAUSTED', message: (err as Error).message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
