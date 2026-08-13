// ============================================
// R3.10-F: Calibration Agreement Metrics (pure math)
//
// Computes agreement between model output and AUTHORITATIVE
// published values. Synthetic regression fixtures are never fed
// into these calculations — separation is enforced by the runner.
//
// Shared `mean` / `rmse` helpers are also used by the golden
// regression runner so the two reports use ONE metric definition.
// ============================================

import type {
  AgreementMetrics,
  CalibrationComparison,
  CalibrationMetrics,
  GroupAgreement,
} from "./types";

/** Arithmetic mean; null for empty input (undefined metric, not 0). */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Root mean square; null for empty input. */
export function rmse(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Agreement metrics over a list of signed errors (predicted - published).
 * `errors` must only contain comparable pairs.
 */
export function computeAgreementMetrics(errors: number[]): AgreementMetrics {
  const n = errors.length;
  if (n === 0) {
    return {
      n: 0,
      mae: null,
      rmse: null,
      meanBias: null,
      exactAgreementRate: null,
      withinOneAgreementRate: null,
      overScoringRate: null,
      underScoringRate: null,
    };
  }
  const mae = mean(errors.map(Math.abs));
  const meanBias = mean(errors);
  const rmseValue = rmse(errors);
  const exact = errors.filter(e => e === 0).length / n;
  const withinOne = errors.filter(e => Math.abs(e) <= 1).length / n;
  const over = errors.filter(e => e > 0).length / n;
  const under = errors.filter(e => e < 0).length / n;
  return {
    n,
    mae: mae === null ? null : round4(mae),
    rmse: rmseValue === null ? null : round4(rmseValue),
    meanBias: meanBias === null ? null : round4(meanBias),
    exactAgreementRate: round4(exact),
    withinOneAgreementRate: round4(withinOne),
    overScoringRate: round4(over),
    underScoringRate: round4(under),
  };
}

/**
 * Group rows by key and compute per-group agreement.
 * Prefers the numeric overall error; falls back to the level
 * agreement indicator (0 = match, 1 = mismatch) for fixtures whose
 * official source publishes a level but no numeric score.
 */
function groupAgreement(
  comparisons: CalibrationComparison[],
  keyFn: (c: CalibrationComparison) => string,
): GroupAgreement[] {
  const map = new Map<string, number[]>();
  for (const c of comparisons) {
    let error: number | null = c.overallError;
    if (error === null && c.levelExactMatch !== null) {
      error = c.levelExactMatch ? 0 : 1;
    }
    if (error === null) continue;
    const key = keyFn(c);
    const list = map.get(key) ?? [];
    list.push(error);
    map.set(key, list);
  }
  const rows: GroupAgreement[] = [];
  for (const [group, errors] of map) {
    const m = computeAgreementMetrics(errors);
    rows.push({
      group,
      n: errors.length,
      exact: m.exactAgreementRate === null ? 0 : m.exactAgreementRate,
      withinOne: m.withinOneAgreementRate === null ? 0 : m.withinOneAgreementRate,
      mae: m.mae,
    });
  }
  rows.sort((a, b) => a.group.localeCompare(b.group));
  return rows;
}

/**
 * Full calibration metrics over authoritative comparisons only.
 * Criterion-level statistics exist ONLY when the source officially
 * publishes criterion scores (comparisons carry null criterion errors
 * otherwise, so those metrics naturally report n = 0).
 */
export function computeCalibrationMetrics(
  comparisons: CalibrationComparison[],
): CalibrationMetrics {
  const overallErrors = comparisons
    .map(c => c.overallError)
    .filter((e): e is number => e !== null);

  const contentErrors = comparisons
    .map(c => c.criterion.content.error)
    .filter((e): e is number => e !== null);
  const languageErrors = comparisons
    .map(c => c.criterion.language.error)
    .filter((e): e is number => e !== null);
  const organizationErrors = comparisons
    .map(c => c.criterion.organization.error)
    .filter((e): e is number => e !== null);

  return {
    overall: computeAgreementMetrics(overallErrors),
    perCriterion: {
      content: computeAgreementMetrics(contentErrors),
      language: computeAgreementMetrics(languageErrors),
      organization: computeAgreementMetrics(organizationErrors),
    },
    perLevel: groupAgreement(comparisons, c =>
      c.publishedLevel === null ? "unpublished" : `Level ${c.publishedLevel}`),
    perYear: groupAgreement(comparisons, c => String(c.year)),
    perTask: groupAgreement(comparisons, c => c.taskId),
    // Marker-policy agreement only exists for human-marker evidence;
    // comparisons without a declared policy are never grouped.
    perMarkerPolicy: groupAgreement(
      comparisons.filter(c => c.markerPolicy !== undefined),
      c => c.markerPolicy as string,
    ),
  };
}
