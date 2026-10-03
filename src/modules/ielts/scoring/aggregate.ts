// ============================================
// IELTS Aggregate Scoring — deterministic combination rules
// ============================================
// * Objective: 40 × 1 mark (subset practice reports raw only)
// * Writing task band = mean of 4 criterion bands (half-band rounded)
// * Writing section = Task 2 double weight
// * Speaking: NOT SCORED by the platform (2026-10-03 II) — preparation
//   coaching only; no speaking band combination exists here by design.
// ============================================

import { computeWritingSectionBand, isValidBand, roundToHalfBand } from '../domain/bands';
import type { IeltsItemScore, IeltsWritingCriterionKey } from '../domain/types';

// ============================================
// Objective aggregation
// ============================================

export interface IeltsObjectiveAggregate {
  answered: number;
  correct: number;
  incorrect: number;
  ungradable: number;
  /** Raw score over scorable items only. */
  rawScore: number;
  rawTotal: number;
}

export function aggregateObjectiveResults(results: readonly IeltsItemScore[]): IeltsObjectiveAggregate {
  let correct = 0;
  let incorrect = 0;
  let ungradable = 0;
  for (const r of results) {
    if (r.verdict === 'correct') correct += 1;
    else if (r.verdict === 'incorrect') incorrect += 1;
    else ungradable += 1;
  }
  return {
    answered: correct + incorrect + ungradable,
    correct,
    incorrect,
    ungradable,
    rawScore: correct,
    rawTotal: correct + incorrect,
  };
}

// ============================================
// Writing combination
// ============================================

export type IeltsCriterionBands = Partial<Record<IeltsWritingCriterionKey, number>>;

/**
 * Writing task band = average of the four criterion bands, rounded to the
 * nearest half band. The platform computes this value itself — an AI-reported
 * aggregate is never trusted.
 */
export function computeWritingTaskBand(criterionBands: IeltsCriterionBands): number | null {
  const values: number[] = [];
  for (const key of [
    'taskAchievementOrResponse',
    'coherenceAndCohesion',
    'lexicalResource',
    'grammaticalRangeAndAccuracy',
  ] as const) {
    const band = criterionBands[key];
    if (typeof band !== 'number' || !isValidBand(band)) return null;
    values.push(band);
  }
  return roundToHalfBand(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Writing section band with Task 2 double weighting. */
export function computeWritingEstimate(task1Band: number, task2Band: number): number {
  return computeWritingSectionBand(task1Band, task2Band);
}
