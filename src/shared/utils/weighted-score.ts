// ============================================
// Shared weighted score computation
// Replaces 7 duplicated implementations across quality sub-modules.
//
// Algorithm: weightedSum = Σ(value[key] × weight[key])
//            overall = Math.round(weightedSum)
//            clamped to 0-100
// ============================================

/**
 * Compute a weighted score from dimension values and their weights.
 * Clamps result to [0, 100].
 *
 * @example
 * const score = computeWeightedScore(
 *   { structure: 85, consistency: 90 },
 *   { structure: 0.5, consistency: 0.5 },
 * );
 * // score = 88
 */
export function computeWeightedScore(
  values: Record<string, number>,
  weights: Record<string, number>,
): number {
  let total = 0;

  for (const key of Object.keys(weights)) {
    total += (values[key] ?? 0) * weights[key];
  }

  return Math.max(0, Math.min(100, Math.round(total)));
}
