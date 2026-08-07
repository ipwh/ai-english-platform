// ============================================
// Experiment Result — aggregation & computation
// of per-variant and per-experiment results from
// raw run metrics.
// ============================================

import type {
  RunMetrics, VariantResult, ExperimentResult,
  ExperimentConfig, ExperimentVariant,
} from './experiment';
import {
  mean, median, stdDev, variance, p50, p90, p95,
} from './statistics';

// ── Public API ──

/**
 * Aggregate raw run metrics into a complete experiment result.
 */
export function aggregateResults(
  experimentId: string,
  experimentName: string,
  config: ExperimentConfig,
  runsByVariant: Map<string, RunMetrics[]>,
  totalDurationMs: number,
  gitCommit: string,
): ExperimentResult {
  const variants: VariantResult[] = [];

  for (const variant of config.variants) {
    const runs = runsByVariant.get(variant.id) ?? [];
    variants.push(aggregateVariant(variant, runs));
  }

  return {
    experimentId,
    experimentName,
    runAt: new Date().toISOString(),
    gitCommit,
    totalDurationMs,
    variants,
    winner: null, // Set later by winner selection
    confidence: null as unknown as ExperimentResult['confidence'], // Computed after
    provider: config.providers[0] ?? 'unknown',
    datasetId: config.datasetId,
    totalRuns: variants.reduce((sum, v) => sum + v.totalRuns, 0),
  };
}

// ── Variant Aggregation ──

function aggregateVariant(
  variant: ExperimentVariant,
  runs: RunMetrics[],
): VariantResult {
  const successful = runs.filter(r => !r.failed);
  const failed = runs.filter(r => r.failed);
  const scores = successful.map(r => r.overallScore);
  const rubricScores = successful.map(r => r.rubricScore);
  const semanticScores = successful.map(r => r.semanticScore);
  const structuralScores = successful.map(r => r.structuralScore);

  // Provider breakdown
  const providerBreakdown: VariantResult['providerBreakdown'] = {};
  for (const run of successful) {
    const prov = run.provider;
    if (!providerBreakdown[prov]) {
      providerBreakdown[prov] = { runs: 0, meanOverall: 0, meanLatencyMs: 0 };
    }
    const entry = providerBreakdown[prov];
    entry.runs++;
    entry.meanOverall = ((entry.meanOverall * (entry.runs - 1)) + run.overallScore) / entry.runs;
    entry.meanLatencyMs = ((entry.meanLatencyMs * (entry.runs - 1)) + run.latencyMs) / entry.runs;
  }

  // Seed breakdown
  const seedBreakdown: VariantResult['seedBreakdown'] = {};
  for (const run of successful) {
    const seed = run.seed;
    if (!seedBreakdown[seed]) {
      seedBreakdown[seed] = { runs: 0, meanOverall: 0, stdDevOverall: 0 };
    }
    const entry = seedBreakdown[seed];
    entry.runs++;
    entry.meanOverall = ((entry.meanOverall * (entry.runs - 1)) + run.overallScore) / entry.runs;
  }
  // Compute stdDev per seed
  for (const seed of Object.keys(seedBreakdown).map(Number)) {
    const seedScores = successful.filter(r => r.seed === seed).map(r => r.overallScore);
    seedBreakdown[seed].stdDevOverall = stdDev(seedScores);
  }

  return {
    variantId: variant.id,
    label: variant.label,
    promptVersion: variant.promptVersion,
    totalRuns: runs.length,
    successfulRuns: successful.length,
    failedRuns: failed.length,
    successRate: runs.length > 0 ? successful.length / runs.length : 0,

    // Score statistics
    meanOverall: mean(scores),
    medianOverall: median(scores),
    stdDevOverall: stdDev(scores),
    varianceOverall: variance(scores),
    p50Overall: p50(scores),
    p90Overall: p90(scores),
    p95Overall: p95(scores),
    minOverall: scores.length > 0 ? Math.min(...scores) : 0,
    maxOverall: scores.length > 0 ? Math.max(...scores) : 0,

    meanRubric: mean(rubricScores),
    meanSemantic: mean(semanticScores),
    meanStructural: mean(structuralScores),

    // Cost & latency
    meanLatencyMs: mean(successful.map(r => r.latencyMs)),
    medianLatencyMs: median(successful.map(r => r.latencyMs)),
    meanCostUsd: mean(successful.map(r => r.costUsd)),
    totalCostUsd: successful.reduce((s, r) => s + r.costUsd, 0),
    meanPromptTokens: mean(successful.map(r => r.promptTokens)),
    meanCompletionTokens: mean(successful.map(r => r.completionTokens)),
    meanJsonRepairCount: mean(successful.map(r => r.jsonRepairCount)),
    meanRetryCount: mean(successful.map(r => r.retryCount)),

    providerBreakdown,
    seedBreakdown,
    runs,
  };
}

// ── Helpers ──

/**
 * Merge winner and confidence into experiment result.
 * Returns a new result (immutable update).
 */
export function finalizeResult(
  result: ExperimentResult,
  winner: ExperimentResult['winner'],
  confidence: ExperimentResult['confidence'],
): ExperimentResult {
  return { ...result, winner, confidence };
}
