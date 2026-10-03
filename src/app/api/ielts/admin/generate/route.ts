// ============================================
// API: POST /api/ielts/admin/generate — AI practice-content generation
// ============================================
// Teacher/admin only. Generates IELTS-style practice content with DeepSeek
// through the guarded pipeline: machine screen + independent blind-solve
// verification → persisted at QA_REQUIRED inside a DRAFT test. The AI can
// NEVER publish; a human reviewer must approve the questions and the test.
//
// Failure mapping: budget → 503 · timeout → 504 · provider → 502 ·
// invalid/refused/non-conforming → 422 · bad input → 400.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { isBudgetExceededError } from '@/modules/ai';
import {
  generateIeltsPracticeContent,
  generateIeltsWritingTask,
  IELTS_TARGET_BAND_VALUES,
  type IeltsGenerationOutcome,
  type IeltsTargetBand,
  type IeltsWritingGenerationOutcome,
} from '@/modules/ielts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RATE_LIMIT = { maxRequests: 5, windowMs: 60_000 };

const SKILLS = new Set(['READING', 'LISTENING', 'WRITING']);
const TEST_TYPES = new Set(['ACADEMIC', 'GENERAL_TRAINING']);
const WRITING_TASKS = new Set(['academic_task1', 'academic_task2', 'general_task1', 'general_task2']);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const TARGET_BANDS = new Set<string>(IELTS_TARGET_BAND_VALUES);

function failureStatus(outcome: IeltsGenerationOutcome | IeltsWritingGenerationOutcome): number {
  if (!outcome.ok) {
    switch (outcome.code) {
      case 'INVALID_INPUT':
        return 400;
      case 'AI_PROVIDER_TIMEOUT':
        return 504;
      case 'AI_PROVIDER_ERROR':
        return 502;
      default:
        return 422; // AI_INVALID_JSON / GENERATION_EMPTY / WRITING_PROMPT_NOT_CONFORMING
    }
  }
  return 201;
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-admin-generate:${authResult.userId}`,
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
      scope?: string;
      count?: number;
      sectionLabel?: string;
      itemTypes?: string[];
      difficulty?: string;
      targetBand?: string;
      topicHint?: string;
      writingTaskType?: string;
    };

    if (!body.skill || !SKILLS.has(body.skill)) {
      return NextResponse.json({ error: 'skill must be one of READING, LISTENING, WRITING' }, { status: 400 });
    }
    if (!body.testType || !TEST_TYPES.has(body.testType)) {
      return NextResponse.json({ error: 'testType must be ACADEMIC or GENERAL_TRAINING' }, { status: 400 });
    }
    const testType = body.testType as 'ACADEMIC' | 'GENERAL_TRAINING';

    if (body.skill === 'WRITING') {
      if (!body.writingTaskType || !WRITING_TASKS.has(body.writingTaskType)) {
        return NextResponse.json(
          { error: 'writingTaskType must be one of ' + [...WRITING_TASKS].join(', ') },
          { status: 400 },
        );
      }
      const outcome = await generateIeltsWritingTask({
        userId: authResult.userId,
        testType,
        writingTaskType: body.writingTaskType as never,
        topicHint: body.topicHint,
      });
      if (!outcome.ok) {
        return NextResponse.json(
          { error: outcome.code, message: outcome.message, issues: outcome.issues ?? [] },
          { status: failureStatus(outcome) },
        );
      }
      return NextResponse.json({ generation: outcome }, { status: 201 });
    }

    if (body.scope !== undefined && body.scope !== 'set' && body.scope !== 'full_component') {
      return NextResponse.json({ error: 'scope must be "set" or "full_component"' }, { status: 400 });
    }
    if (body.count !== undefined && (typeof body.count !== 'number' || !Number.isInteger(body.count))) {
      return NextResponse.json({ error: 'count must be an integer' }, { status: 400 });
    }
    if (body.difficulty !== undefined && !DIFFICULTIES.has(body.difficulty)) {
      return NextResponse.json({ error: 'difficulty must be EASY, MEDIUM or HARD' }, { status: 400 });
    }
    if (body.targetBand !== undefined && !TARGET_BANDS.has(body.targetBand)) {
      return NextResponse.json(
        { error: 'targetBand must be one of ' + IELTS_TARGET_BAND_VALUES.join(', ') },
        { status: 400 },
      );
    }

    const outcome = await generateIeltsPracticeContent({
      userId: authResult.userId,
      skill: body.skill as 'READING' | 'LISTENING',
      testType,
      scope: (body.scope as 'set' | 'full_component' | undefined) ?? 'set',
      count: body.count,
      sectionLabel: body.sectionLabel,
      itemTypes: Array.isArray(body.itemTypes) ? body.itemTypes : undefined,
      difficulty: body.difficulty as 'EASY' | 'MEDIUM' | 'HARD' | undefined,
      targetBand: body.targetBand as IeltsTargetBand | undefined,
      topicHint: body.topicHint,
    });
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.code, message: outcome.message }, { status: failureStatus(outcome) });
    }
    return NextResponse.json({ generation: outcome }, { status: 201 });
  } catch (err) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: 'AI_BUDGET_EXHAUSTED', message: (err as Error).message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
