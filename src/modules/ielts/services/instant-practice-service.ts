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
// ============================================

import { hkStartOfDay } from '@/shared/utils/hk-date';
import type { IeltsTestType } from '../domain/types';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import {
  generateIeltsPracticeContent,
  type IeltsGenerationInput,
  type IeltsGenerationOutcome,
} from './generation-service';

/** On-demand AI sets a student may generate per Hong Kong day. */
export const IELTS_INSTANT_PRACTICE_DAILY_LIMIT = 8;
export const IELTS_INSTANT_DEFAULT_ITEMS = 5;
export const IELTS_INSTANT_MIN_ITEMS = 3;
export const IELTS_INSTANT_MAX_READING_ITEMS = 14;
export const IELTS_INSTANT_MAX_LISTENING_ITEMS = 10;

export type IeltsInstantPracticeSkill = 'READING' | 'LISTENING';

export interface IeltsInstantPracticeInput {
  userId: string;
  skill: IeltsInstantPracticeSkill;
  testType: IeltsTestType;
  /** Defaults to IELTS_INSTANT_DEFAULT_ITEMS; bounded per skill. */
  count?: number;
  topicHint?: string;
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
        | 'AI_PROVIDER_TIMEOUT'
        | 'AI_PROVIDER_ERROR'
        | 'AI_INVALID_JSON';
      message: string;
    };

export interface IeltsInstantPracticeDeps {
  /** Injected for tests; defaults to the canonical generation pipeline. */
  generate?: (input: IeltsGenerationInput) => Promise<IeltsGenerationOutcome>;
  countCreatedSince?: (ownerUserId: string, since: Date) => Promise<number>;
  now?: () => Date;
}

export async function generateIeltsInstantPractice(
  input: IeltsInstantPracticeInput,
  deps: IeltsInstantPracticeDeps = {},
): Promise<IeltsInstantPracticeOutcome> {
  const generate = deps.generate ?? generateIeltsPracticeContent;
  const countCreatedSince = deps.countCreatedSince ?? ieltsRepo.countInstantTestsCreatedSince;
  const now = deps.now ?? (() => new Date());

  if (input.skill !== 'READING' && input.skill !== 'LISTENING') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'skill must be READING or LISTENING for instant practice.',
    };
  }
  if (input.testType !== 'ACADEMIC' && input.testType !== 'GENERAL_TRAINING') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'testType must be ACADEMIC or GENERAL_TRAINING.',
    };
  }
  const maxItems =
    input.skill === 'READING'
      ? IELTS_INSTANT_MAX_READING_ITEMS
      : IELTS_INSTANT_MAX_LISTENING_ITEMS;
  const count = input.count ?? IELTS_INSTANT_DEFAULT_ITEMS;
  if (!Number.isInteger(count) || count < IELTS_INSTANT_MIN_ITEMS || count > maxItems) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: `count must be an integer between ${IELTS_INSTANT_MIN_ITEMS} and ${maxItems} for instant ${input.skill} practice.`,
    };
  }

  // Per-student cap — Hong Kong day boundary (never a UTC day).
  const usedToday = await countCreatedSince(input.userId, hkStartOfDay(now()));
  if (usedToday >= IELTS_INSTANT_PRACTICE_DAILY_LIMIT) {
    return {
      ok: false,
      code: 'INSTANT_DAILY_LIMIT_REACHED',
      message: `Daily instant-practice limit reached (${IELTS_INSTANT_PRACTICE_DAILY_LIMIT} sets per Hong Kong day).`,
    };
  }

  const outcome = await generate({
    userId: input.userId,
    skill: input.skill,
    testType: input.testType,
    scope: 'set',
    count,
    topicHint: input.topicHint,
    deliveryMode: 'INSTANT',
  });
  if (!outcome.ok) {
    // Typed generation failures pass through; budget errors in `generate`
    // throw and are intentionally NOT caught (routes map them to 503).
    return { ok: false, code: outcome.code, message: outcome.message };
  }

  emitIeltsEvent('ielts.instant.delivered', {
    userId: input.userId,
    skill: input.skill,
    taskType: input.testType,
    itemCount: outcome.deliveredCount,
    durationMs: outcome.durationMs,
    code: outcome.shortfall > 0 ? 'DELIVERED_WITH_SHORTFALL' : 'DELIVERED',
  });

  return {
    ok: true,
    data: {
      testId: outcome.testId,
      skill: input.skill,
      testType: input.testType,
      requestedCount: outcome.requestedCount,
      deliveredCount: outcome.deliveredCount,
      shortfall: outcome.shortfall,
      remainingToday: IELTS_INSTANT_PRACTICE_DAILY_LIMIT - usedToday - 1,
      durationMs: outcome.durationMs,
    },
  };
}
