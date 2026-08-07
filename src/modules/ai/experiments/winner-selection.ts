// ============================================
// Winner Selection — automatic determination of
// the winning variant in an experiment.
//
// Priority (descending):
//   1. Overall Score
//   2. Structural Score
//   3. Semantic Score
//   4. Rubric Score
//   5. Cost
//   6. Latency
//
// If scores differ less than the threshold,
// returns "No Significant Winner".
// ============================================

import type {
  ExperimentResult, VariantResult, WinnerResult, WinnerBreakdown,
} from './experiment';
import { welchTTest, cohensD, interpretCohensD } from './statistics';

// ── Public API ──

/**
 * Determine the winner of an experiment.
 *
 * @param result - The experiment result
 * @param threshold - Minimum score difference to declare a winner (default 1.0)
 * @param requireSignificance - Whether to require statistical significance (default true)
 */
export function selectWinner(
  result: ExperimentResult,
  threshold: number = 1.0,
  requireSignificance: boolean = true,
): WinnerResult {
  if (result.variants.length === 0) {
    return noWinner('No variants in experiment');
  }

  if (result.variants.length === 1) {
    const v = result.variants[0];
    return {
      variantId: v.variantId,
      label: v.label,
      isSignificant: false,
      reason: 'Single variant — no comparison possible',
      scoreDelta: 0,
      breakdown: emptyBreakdown(),
    };
  }

  // Rank by overall score
  const ranked = [...result.variants].sort((a, b) => b.meanOverall - a.meanOverall);
  const winner = ranked[0];
  const runnerUp = ranked[1];

  const overallDelta = winner.meanOverall - runnerUp.meanOverall;

  // Check statistical significance
  const winnerScores = winner.runs.filter(r => !r.failed).map(r => r.overallScore);
  const runnerUpScores = runnerUp.runs.filter(r => !r.failed).map(r => r.overallScore);
  const tTest = welchTTest(winnerScores, runnerUpScores);
  const d = cohensD(winnerScores, runnerUpScores);
  const effectSize = interpretCohensD(d);

  // Build breakdown
  const breakdown: WinnerBreakdown = {
    overall: { winner: winner.meanOverall, runnerUp: runnerUp.meanOverall, delta: overallDelta },
    structural: { winner: winner.meanStructural, runnerUp: runnerUp.meanStructural, delta: winner.meanStructural - runnerUp.meanStructural },
    semantic: { winner: winner.meanSemantic, runnerUp: runnerUp.meanSemantic, delta: winner.meanSemantic - runnerUp.meanSemantic },
    rubric: { winner: winner.meanRubric, runnerUp: runnerUp.meanRubric, delta: winner.meanRubric - runnerUp.meanRubric },
    cost: { winner: winner.meanCostUsd, runnerUp: runnerUp.meanCostUsd, delta: runnerUp.meanCostUsd - winner.meanCostUsd }, // positive = winner is cheaper
    latency: { winner: winner.meanLatencyMs, runnerUp: runnerUp.meanLatencyMs, delta: runnerUp.meanLatencyMs - winner.meanLatencyMs }, // positive = winner is faster
  };

  // Decision logic
  const isSignificant = !requireSignificance || tTest.significant;
  const isMeaningful = Math.abs(overallDelta) >= threshold;

  if (!isMeaningful) {
    return {
      variantId: null,
      label: null,
      isSignificant: false,
      reason: `No significant winner — score delta (${overallDelta.toFixed(1)}) below threshold (${threshold})`,
      scoreDelta: overallDelta,
      breakdown,
    };
  }

  if (!isSignificant && requireSignificance) {
    return {
      variantId: null,
      label: null,
      isSignificant: false,
      reason: `Difference not statistically significant (p=${tTest.pValue.toFixed(3)}, d=${d.toFixed(2)} [${effectSize}])`,
      scoreDelta: overallDelta,
      breakdown,
    };
  }

  // Apply tiebreaker sequence: Overall → Structural → Semantic → Rubric → Cost → Latency
  const reason = buildWinnerReason(winner, runnerUp, breakdown, tTest, d, effectSize);

  return {
    variantId: winner.variantId,
    label: winner.label,
    isSignificant,
    reason,
    scoreDelta: overallDelta,
    breakdown,
  };
}

// ── Tiebreaker Logic ──

function buildWinnerReason(
  winner: VariantResult,
  runnerUp: VariantResult,
  breakdown: WinnerBreakdown,
  tTest: { tStatistic: number; pValue: number; significant: boolean },
  d: number,
  effectSize: string,
): string {
  const parts: string[] = [];

  // Overall
  parts.push(
    `Overall: ${winner.label} (${winner.meanOverall.toFixed(1)}) > ${runnerUp.label} (${runnerUp.meanOverall.toFixed(1)}), Δ=${breakdown.overall.delta.toFixed(1)}`,
  );

  // Structural (tiebreaker #1)
  if (breakdown.structural.delta > 0.5) {
    parts.push(`Structural: ${winner.label} leads by ${breakdown.structural.delta.toFixed(1)}`);
  }

  // Semantic (tiebreaker #2)
  if (breakdown.semantic.delta > 0.5) {
    parts.push(`Semantic: ${winner.label} leads by ${breakdown.semantic.delta.toFixed(1)}`);
  }

  // Rubric (tiebreaker #3)
  if (breakdown.rubric.delta > 0.5) {
    parts.push(`Rubric: ${winner.label} leads by ${breakdown.rubric.delta.toFixed(1)}`);
  }

  // Cost
  if (breakdown.cost.delta > 0.0001) {
    const pct = ((breakdown.cost.delta / runnerUp.meanCostUsd) * 100).toFixed(1);
    parts.push(`Cost: ${winner.label} is ${pct}% cheaper`);
  }

  // Latency
  if (breakdown.latency.delta > 10) {
    parts.push(`Latency: ${winner.label} is ${breakdown.latency.delta.toFixed(0)}ms faster`);
  }

  // Effect size
  parts.push(`Effect: d=${d.toFixed(2)} (${effectSize}), p=${tTest.pValue.toFixed(4)}`);

  return parts.join(' | ');
}

// ── Helpers ──

function noWinner(reason: string): WinnerResult {
  return {
    variantId: null,
    label: null,
    isSignificant: false,
    reason,
    scoreDelta: 0,
    breakdown: emptyBreakdown(),
  };
}

function emptyBreakdown(): WinnerBreakdown {
  return {
    overall: { winner: 0, runnerUp: 0, delta: 0 },
    structural: { winner: 0, runnerUp: 0, delta: 0 },
    semantic: { winner: 0, runnerUp: 0, delta: 0 },
    rubric: { winner: 0, runnerUp: 0, delta: 0 },
    cost: { winner: 0, runnerUp: 0, delta: 0 },
    latency: { winner: 0, runnerUp: 0, delta: 0 },
  };
}

// ── Ranking ──

/**
 * Rank all variants by score with tiebreaker sequence.
 */
export function rankVariants(result: ExperimentResult): VariantResult[] {
  return [...result.variants].sort((a, b) => {
    // Primary: overall score
    if (Math.abs(a.meanOverall - b.meanOverall) >= 0.5) {
      return b.meanOverall - a.meanOverall;
    }
    // Tiebreaker 1: structural
    if (Math.abs(a.meanStructural - b.meanStructural) >= 0.5) {
      return b.meanStructural - a.meanStructural;
    }
    // Tiebreaker 2: semantic
    if (Math.abs(a.meanSemantic - b.meanSemantic) >= 0.5) {
      return b.meanSemantic - a.meanSemantic;
    }
    // Tiebreaker 3: rubric
    if (Math.abs(a.meanRubric - b.meanRubric) >= 0.5) {
      return b.meanRubric - a.meanRubric;
    }
    // Tiebreaker 4: cost (lower is better)
    return a.meanCostUsd - b.meanCostUsd;
  });
}
