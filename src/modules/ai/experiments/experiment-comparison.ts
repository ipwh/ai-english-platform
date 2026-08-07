// ============================================
// Experiment Comparison — head-to-head variant
// and provider comparisons.
// ============================================

import type {
  ExperimentResult, VariantResult,
  VariantComparison, ProviderComparison,
} from './experiment';
import { welchTTest, cohensD, mean } from './statistics';

// ── Variant Comparison ──

/**
 * Compare two variants head-to-head.
 * Returns detailed comparison with significance testing.
 */
export function compareVariants(
  result: ExperimentResult,
  variantAId: string,
  variantBId: string,
): VariantComparison | null {
  const vA = result.variants.find(v => v.variantId === variantAId);
  const vB = result.variants.find(v => v.variantId === variantBId);

  if (!vA || !vB) return null;

  const scoresA = vA.runs.filter(r => !r.failed).map(r => r.overallScore);
  const scoresB = vB.runs.filter(r => !r.failed).map(r => r.overallScore);

  const tTest = welchTTest(scoresA, scoresB);
  const d = cohensD(scoresA, scoresB);

  let winner: string;
  if (!tTest.significant) {
    winner = 'tie';
  } else {
    winner = vA.meanOverall > vB.meanOverall ? variantAId : variantBId;
  }

  return {
    variantA: variantAId,
    variantB: variantBId,
    winner,
    deltas: {
      overall: vA.meanOverall - vB.meanOverall,
      rubric: vA.meanRubric - vB.meanRubric,
      semantic: vA.meanSemantic - vB.meanSemantic,
      structural: vA.meanStructural - vB.meanStructural,
      latency: vB.meanLatencyMs - vA.meanLatencyMs, // positive = A is faster
      cost: vB.meanCostUsd - vA.meanCostUsd, // positive = A is cheaper
    },
    significant: tTest.significant,
    pValue: tTest.pValue,
  };
}

/**
 * Compare all variant pairs. Returns an N×N matrix (upper triangular).
 */
export function compareAllVariants(
  result: ExperimentResult,
): VariantComparison[] {
  const comparisons: VariantComparison[] = [];
  const variants = result.variants;

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const comp = compareVariants(result, variants[i].variantId, variants[j].variantId);
      if (comp) comparisons.push(comp);
    }
  }

  return comparisons;
}

// ── Provider Comparison ──

/**
 * Compare provider performance for a variant.
 */
export function compareProvidersForVariant(
  result: ExperimentResult,
  variantId: string,
): ProviderComparison | null {
  const variant = result.variants.find(v => v.variantId === variantId);
  if (!variant) return null;

  const providers: ProviderComparison['providers'] = {};

  for (const [provider, breakdown] of Object.entries(variant.providerBreakdown)) {
    const providerRuns = variant.runs.filter(
      r => r.provider === provider && !r.failed,
    );
    providers[provider] = {
      meanOverall: breakdown.meanOverall,
      meanLatencyMs: breakdown.meanLatencyMs,
      meanCostUsd: mean(providerRuns.map(r => r.costUsd)),
      successRate: providerRuns.length > 0
        ? providerRuns.filter(r => !r.failed).length / providerRuns.length
        : 0,
      runs: breakdown.runs,
    };
  }

  return { variantId, providers };
}

/**
 * Compare providers across all variants.
 */
export function compareAllProviders(
  result: ExperimentResult,
): ProviderComparison[] {
  return result.variants
    .map(v => compareProvidersForVariant(result, v.variantId))
    .filter(Boolean) as ProviderComparison[];
}

// ── Score Distribution ──

/**
 * Generate score distribution buckets for visualization.
 */
export function scoreDistribution(
  variant: VariantResult,
  bucketSize: number = 5,
): Array<{ range: string; count: number; label: string }> {
  const buckets: Array<{ range: string; count: number; label: string }> = [];
  const scores = variant.runs.filter(r => !r.failed).map(r => r.overallScore);

  for (let low = 0; low < 100; low += bucketSize) {
    const high = low + bucketSize;
    const count = scores.filter(s => s >= low && s < high).length;
    const bar = '█'.repeat(Math.min(count, 50));
    buckets.push({
      range: `${low}-${high}`,
      count,
      label: `${String(low).padStart(2)}-${String(high).padStart(2)}: ${bar} (${count})`,
    });
  }

  return buckets;
}

// ── Trends ──

/**
 * Compare latest result against baseline (previous experiment).
 */
export function compareAgainstBaseline(
  current: ExperimentResult,
  baseline: ExperimentResult,
): { improved: boolean; degradation: number; details: string } {
  const currentBest = current.variants.reduce(
    (best, v) => v.meanOverall > best ? v.meanOverall : best,
    0,
  );
  const baselineBest = baseline.variants.reduce(
    (best, v) => v.meanOverall > best ? v.meanOverall : best,
    0,
  );

  const degradation = baselineBest - currentBest;

  return {
    improved: degradation < 0,
    degradation,
    details: `Current best: ${currentBest.toFixed(1)} | Baseline best: ${baselineBest.toFixed(1)} | Δ: ${degradation > 0 ? '-' : '+'}${Math.abs(degradation).toFixed(1)}`,
  };
}
