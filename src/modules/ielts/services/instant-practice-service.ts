// ============================================
// 2026-10-03 (VII): IELTS Instant Self-Study Practice
// ============================================
// Solves the availability problem ("students must be able to practise at ANY
// time") WITHOUT weakening the no-auto-publish invariant:
//
//   * NOT a publication: nothing enters the catalogue. The set is deliverable
//     ONLY to its owner and is clearly labelled "not teacher-reviewed".
//   * SAME gates as authoring: generation runs inside
//     `generateIeltsPracticeContent` — deterministic machine screen + an
//     independent blind-solve verification pass, fail-closed (nothing persists
//     when nothing survives; shortfall reported honestly).
//   * Persisted state is unchanged: DRAFT test + QA_REQUIRED questions. AI
//     still can never publish; graduation into the catalogue requires the
//     normal human review + publish path (which flips origin → CATALOGUE).
//   * Bounded cost: per-student Hong Kong-day cap here, plus the route rate
//     limit and the global AI budget gate (budget errors propagate untouched
//     so routes map them to 503).
//
// 2026-10-04: WRITING joins the on-demand path — a student may generate an
//   IELTS-style writing task (conformance-checked, same owner-only/never-listed
//   semantics, one shared daily budget with reading/listening).
// ============================================

import { hkStartOfDay } from '@/shared/utils/hk-date';
import { IELTS_WRITING_TASK_TYPES, type IeltsTestType, type IeltsWritingTaskType } from '../domain/types';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import {
  generateIeltsPracticeContent,
  generateIeltsWritingTask,
  type IeltsGenerationInput,
  type IeltsGenerationOutcome,
  type IeltsWritingGenerationInput,
  type IeltsWritingGenerationOutcome,
} from './generation-service';

/** On-demand AI sets a student may generate per Hong Kong day. */
export const IELTS_INSTANT_PRACTICE_DAILY_LIMIT = 8;
export const IELTS_INSTANT_DEFAULT_ITEMS = 5;
export const IELTS_INSTANT_MIN_ITEMS = 3;
export const IELTS_INSTANT_MAX_READING_ITEMS = 14;
export const IELTS_INSTANT_MAX_LISTENING_ITEMS = 10;

export type IeltsInstantPracticeSkill = 'READING' | 'LISTENING' | 'WRITING';

export const IELTS_WRITING_TASK_TYPE_SET: ReadonlySet<string> = new Set(IELTS_WRITING_TASK_TYPES);

export interface IeltsInstantPracticeInput {
  userId: string;
  skill: IeltsInstantPracticeSkill;
  testType: IeltsTestType;
  /** Defaults to IELTS_INSTANT_DEFAULT_ITEMS; bounded per skill. Ignored for WRITING. */
  count?: number;
  topicHint?: string;
  /** Required when skill === 'WRITING'; must match testType (academic_* / general_*). */
  writingTaskType?: IeltsWritingTaskType;
}

export interface IeltsInstantPracticeResult {
  testId: string;
  skill: IeltsInstantPracticeSkill;
  testType: IeltsTestType;
  requestedCount: number;
  deliveredCount: number;
  shortfall: number;
  /** Remaining on-demand generations for the current Hong Kong day. */
  remainingToday: number;
  durationMs: number;
}

export type IeltsInstantPracticeOutcome =
  | { ok: true; data: IeltsInstantPracticeResult }
  | {
      ok: false;
      code:
        | 'INVALID_INPUT'
        | 'INSTANT_DAILY_LIMIT_REACHED'
        | 'GENERATION_EMPTY'
        | 'WRITING_PROMPT_NOT_CONFORMING'
        | 'AI_PROVIDER_TIMEOUT'
        | 'AI_PROVIDER_ERROR'
        | 'AI_INVALID_JSON';
      message: string;
    };

export interface IeltsInstantPracticeDeps {
  /** Injected for tests; defaults to the canonical generation pipeline. */
  generate?: (input: IeltsGenerationInput) => Promise<IeltsGenerationOutcome>;
  generateWriting?: (input: IeltsWritingGenerationInput) => Promise<IeltsWritingGenerationOutcome>;
  countCreatedSince?: (ownerUserId: string, since: Date) => Promise<number>;
  now?: () => Date;
}

export async function generateIeltsInstantPractice(
  input: IeltsInstantPracticeInput,
  deps: IeltsInstantPracticeDeps = {},
): Promise<IeltsInstantPracticeOutcome> {
  const generate = deps.generate ?? generateIeltsPracticeContent;
  const generateWriting = deps.generateWriting ?? generateIeltsWritingTask;
  const countCreatedSince = deps.countCreatedSince ?? ieltsRepo.countInstantTestsCreatedSince;
  const now = deps.now ?? (() => new Date());

  if (input.skill !== 'READING' && input.skill !== 'LISTENING' && input.skill !== 'WRITING') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'skill must be READING, LISTENING or WRITING for instant practice.',
    };
  }
  if (input.testType !== 'ACADEMIC' && input.testType !== 'GENERAL_TRAINING') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'testType must be ACADEMIC or GENERAL_TRAINING.',
    };
  }

  const skill = input.skill;
  const isWriting = skill === 'WRITING';
  let count = 1;
  if (isWriting) {
    // Writing is always ONE task; the task type must belong to the chosen variant.
    if (!input.writingTaskType || !IELTS_WRITING_TASK_TYPE_SET.has(input.writingTaskType)) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `writingTaskType must be one of ${IELTS_WRITING_TASK_TYPES.join(', ')} for instant writing practice.`,
      };
    }
    if ((input.testType === 'ACADEMIC') !== input.writingTaskType.startsWith('academic')) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `Writing task ${input.writingTaskType} does not belong to ${input.testType}.`,
      };
    }
  } else {
    const maxItems =
      skill === 'READING'
        ? IELTS_INSTANT_MAX_READING_ITEMS
        : IELTS_INSTANT_MAX_LISTENING_ITEMS;
    count = input.count ?? IELTS_INSTANT_DEFAULT_ITEMS;
    if (!Number.isInteger(count) || count < IELTS_INSTANT_MIN_ITEMS || count > maxItems) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `count must be an integer between ${IELTS_INSTANT_MIN_ITEMS} and ${maxItems} for instant ${skill} practice.`,
      };
    }
  }

  // Per-student cap — Hong Kong day boundary (never a UTC day). One shared budget:
  // reading, listening and writing self-study sets all count against it.
  const usedToday = await countCreatedSince(input.userId, hkStartOfDay(now()));
  if (usedToday >= IELTS_INSTANT_PRACTICE_DAILY_LIMIT) {
    return {
      ok: false,
      code: 'INSTANT_DAILY_LIMIT_REACHED',
      message: `Daily instant-practice limit reached (${IELTS_INSTANT_PRACTICE_DAILY_LIMIT} sets per Hong Kong day).`,
    };
  }

  const remainingToday = IELTS_INSTANT_PRACTICE_DAILY_LIMIT - usedToday - 1;

  if (isWriting) {
    const outcome = await generateWriting({
      userId: input.userId,
      testType: input.testType,
      writingTaskType: input.writingTaskType as IeltsWritingTaskType,
      topicHint: input.topicHint,
      deliveryMode: 'INSTANT',
    });
    if (!outcome.ok) {
      // Typed generation failures pass through; budget errors in `generateWriting`
      // throw and are intentionally NOT caught (routes map them to 503).
      return { ok: false, code: outcome.code, message: outcome.message };
    }
    emitIeltsEvent('ielts.instant.delivered', {
      userId: input.userId,
      skill: 'WRITING',
      taskType: input.writingTaskType,
      itemCount: 1,
      durationMs: outcome.durationMs,
      code: 'DELIVERED',
    });
    return {
      ok: true,
      data: {
        testId: outcome.testId,
        skill: 'WRITING',
        testType: input.testType,
        requestedCount: 1,
        deliveredCount: 1,
        shortfall: 0,
        remainingToday,
        durationMs: outcome.durationMs,
      },
    };
  }

  const outcome = await generate({
    userId: input.userId,
    skill,
    testType: input.testType,
    scope: 'set',
    count,
    topicHint: input.topicHint,
    deliveryMode: 'INSTANT',
  });
  if (!outcome.ok) {
    // Typed generation failures pass through; budget errors in `generate` throw
    // and are intentionally NOT caught (routes map them to 503).
    return { ok: false, code: outcome.code, message: outcome.message };
  }

  emitIeltsEvent('ielts.instant.delivered', {
    userId: input.userId,
    skill,
    taskType: input.testType,
    itemCount: outcome.deliveredCount,
    durationMs: outcome.durationMs,
    code: outcome.shortfall > 0 ? 'DELIVERED_WITH_SHORTFALL' : 'DELIVERED',
  });

  return {
    ok: true,
    data: {
      testId: outcome.testId,
      skill,
      testType: input.testType,
      requestedCount: outcome.requestedCount,
      deliveredCount: outcome.deliveredCount,
      shortfall: outcome.shortfall,
      remainingToday,
      durationMs: outcome.durationMs,
    },
  };
}
