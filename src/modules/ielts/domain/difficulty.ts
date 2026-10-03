// ============================================
// IELTS Difficulty — platform authoring policy (2026-10-03)
// ============================================
// IMPORTANT (audit policy): IELTS publishes NO per-item difficulty taxonomy.
// The TARGET_BAND_* labels below are an ENGINEERING authoring heuristic — a
// request for how hard to aim when generating practice items — NOT a claim that
// an item "is a Band 7 question", NOT comparable to official test difficulty,
// and NOT numerically equivalent to CEFR levels. Empirically calibrated item
// difficulty would require response data and is deliberately not claimed.
// See docs/ielts/IELTS_SPECIFICATION.md §6.
// ============================================

import type { IeltsDifficulty } from './types';

export const IELTS_TARGET_BAND_VALUES = [
  'TARGET_BAND_4',
  'TARGET_BAND_5',
  'TARGET_BAND_5_5',
  'TARGET_BAND_6',
  'TARGET_BAND_6_5',
  'TARGET_BAND_7',
  'TARGET_BAND_7_5',
  'TARGET_BAND_8',
  'TARGET_BAND_8_5',
  'TARGET_BAND_9',
] as const;

export type IeltsTargetBand = (typeof IELTS_TARGET_BAND_VALUES)[number];

/** Basis label recorded (and grep-able) with the mapping — never 'official'. */
export const IELTS_TARGET_BAND_BASIS = 'AUTHOR_HEURISTIC' as const;

/** Documented platform mapping (authoring guidance only — never a difficulty claim). */
const TARGET_BAND_TO_DIFFICULTY: Readonly<Record<IeltsTargetBand, IeltsDifficulty>> = {
  TARGET_BAND_4: 'EASY',
  TARGET_BAND_5: 'EASY',
  TARGET_BAND_5_5: 'EASY',
  TARGET_BAND_6: 'MEDIUM',
  TARGET_BAND_6_5: 'MEDIUM',
  TARGET_BAND_7: 'MEDIUM',
  TARGET_BAND_7_5: 'HARD',
  TARGET_BAND_8: 'HARD',
  TARGET_BAND_8_5: 'HARD',
  TARGET_BAND_9: 'HARD',
};

export function isIeltsTargetBand(value: string): value is IeltsTargetBand {
  return (IELTS_TARGET_BAND_VALUES as readonly string[]).includes(value);
}

/** Returns the authoring difficulty bucket, or null for an unknown label. */
export function difficultyForTargetBand(value: string): IeltsDifficulty | null {
  return isIeltsTargetBand(value) ? TARGET_BAND_TO_DIFFICULTY[value] : null;
}
