// ============================================
// API: POST /api/ielts/practice/instant — on-demand self-study practice
// ============================================
// Generates an INSTANT IELTS-style set (deterministic machine screen +
// independent blind-solve verification) and delivers it to the requesting
// student ONLY, clearly labelled as NOT teacher-reviewed.
//
// This is deliberately NOT publication: nothing enters the catalogue, and the
// persisted state stays DRAFT + QA_REQUIRED (AI can never publish). A teacher
// can still review the set in the console; publishing it graduates it into
// the catalogue through the normal human path.
//
// Failure mapping: bad input → 400 · daily cap → 429 · nothing survived the
// gates → 422 · timeout → 504 · provider → 502 · budget → 503.
//
// 2026-10-04: skill=WRITING is supported (requires writingTaskType); the task
// is delivered to its owner only and is never listed until a teacher publishes
// it — instant delivery is NOT publication.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { isBudgetExceededError } from '@/modules/ai';
import { generateIeltsInstantPractice, IELTS_WRITING_TASK_TYPES, type IeltsWritingTaskType } from '@/modules/ielts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RATE_LIMIT = { maxRequests: 6, windowMs: 60_000 };
const SKILLS = new Set(['READING', 'LISTENING', 'WRITING']);
const TEST_TYPES = new Set(['ACADEMIC', 'GENERAL_TRAINING']);
const WRITING_TASK_TYPES = new Set<string>(IELTS_WRITING_TASK_TYPES);
const MAX_TOPIC_CHARS = 200;

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-instant-practice:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as {
      skill?: string;
      testType?: string;
      count?: number;
      topicHint?: string;
      writingTaskType?: string;
    };
    if (!body.skill || !SKILLS.has(body.skill)) {
      return NextResponse.json({ error: 'skill must be READING, LISTENING or WRITING' }, { status: 400 });
    }
    if (!body.testType || !TEST_TYPES.has(body.testType)) {
      return NextResponse.json({ error: 'testType must be ACADEMIC or GENERAL_TRAINING' }, { status: 400 });
    }
    if (body.skill === 'WRITING' && (!body.writingTaskType || !WRITING_TASK_TYPES.has(body.writingTaskType))) {
      return NextResponse.json(
        { error: `writingTaskType must be one of ${IELTS_WRITING_TASK_TYPES.join(', ')} when skill is WRITING` },
        { status: 400 },
      );
    }
    if (body.count !== undefined && (typeof body.count !== 'number' || !Number.isInteger(body.count))) {
      return NextResponse.json({ error: 'count must be an integer' }, { status: 400 });
    }
    const topicHint =
      typeof body.topicHint === 'string' ? body.topicHint.trim().slice(0, MAX_TOPIC_CHARS) : '';

    const outcome = await generateIeltsInstantPractice({
      userId: authResult.userId,
      skill: body.skill as 'READING' | 'LISTENING' | 'WRITING',
      testType: body.testType as 'ACADEMIC' | 'GENERAL_TRAINING',
      count: body.count,
      ...(topicHint ? { topicHint } : {}),
      ...(body.writingTaskType
        ? { writingTaskType: body.writingTaskType as IeltsWritingTaskType }
        : {}),
    });
    if (!outcome.ok) {
      const status =
        outcome.code === 'INVALID_INPUT'
          ? 400
          : outcome.code === 'INSTANT_DAILY_LIMIT_REACHED'
            ? 429
            : outcome.code === 'AI_PROVIDER_TIMEOUT'
              ? 504
              : outcome.code === 'AI_PROVIDER_ERROR'
                ? 502
                : 422; // GENERATION_EMPTY / WRITING_PROMPT_NOT_CONFORMING / AI_INVALID_JSON
      return NextResponse.json({ error: outcome.code, message: outcome.message }, { status });
    }
    return NextResponse.json({ instant: outcome.data }, { status: 201 });
  } catch (err) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json(
        { error: 'AI_BUDGET_EXHAUSTED', message: (err as Error).message },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
