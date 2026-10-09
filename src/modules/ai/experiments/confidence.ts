// ============================================
// Confidence Scoring — statistical confidence
// for experiment results.
//
// Computes: overall confidence, seed stability,
// provider stability, dataset stability, and
// confidence intervals per variant.
// ============================================

import type {
  ExperimentResult, ConfidenceResult,
} from './experiment';
import {
  mean, stdDev, confidenceInterval95, stabilityScore, welchTTest,
} from './statistics';

// ── Public API ──

/**
 * Compute comprehensive confidence assessment for an experiment.
 */
export function computeConfidence(result: ExperimentResult): ConfidenceResult {
  const variantConfidence = computeVariantConfidence(result);
  const seedStability = computeSeedStability(result);
  const providerStability = computeProviderStability(result);
  const datasetStability = computeDatasetStability(result);
  const overallVariance = computeOverallVariance(result);

  // Overall confidence = weighted combination
  const score = computeOverallConfidenceScore(
    variantConfidence,
    seedStability,
    providerStability,
    datasetStability,
    overallVariance,
  );

  // Determine significance
  const isSignificant = determineSignificance(result, score);

  return {
    score,
    level: formatConfidenceLevel(score),
    interval: computeOverallInterval(result),
    isSignificant,
    seedStability,
    providerStability,
    datasetStability,
    overallVariance,
    variantConfidence: Object.fromEntries(
      variantConfidence.map(v => [v.variantId, {
        mean: v.mean,
        stdDev: v.stdDev,
        confidenceInterval: v.confidenceInterval,
      }]),
    ),
  };
}

// ── Variant-Level Confidence ──

interface VariantConfidenceDetail {
  variantId: string;
  mean: number;
  stdDev: number;
  confidenceInterval: [number, number];
  sampleSize: number;
}

function computeVariantConfidence(result: ExperimentResult): VariantConfidenceDetail[] {
  return result.variants.map(v => {
    const scores = v.runs.filter(r => !r.failed).map(r => r.overallScore);
    return {
      variantId: v.variantId,
      mean: v.meanOverall,
      stdDev: v.stdDevOverall,
      confidenceInterval: confidenceInterval95(scores),
      sampleSize: scores.length,
    };
  });
}

// ── Stability Metrics ──

function computeSeedStability(result: ExperimentResult): number {
  // For each variant, compute stability of scores across seeds
  const stabilities: number[] = [];

  for (const variant of result.variants) {
    const seedScores: number[] = [];
    for (const [, breakdown] of Object.entries(variant.seedBreakdown)) {
      seedScores.push(breakdown.meanOverall);
    }
    if (seedScores.length > 1) {
      stabilities.push(stabilityScore(seedScores));
    }
  }

  return stabilities.length > 0 ? mean(stabilities) : 100;
}

function computeProviderStability(result: ExperimentResult): number {
  // For each variant, compute stability of scores across providers
  const stabilities: number[] = [];

  for (const variant of result.variants) {
    const providerScores: number[] = [];
    for (const [, breakdown] of Object.entries(variant.providerBreakdown)) {
      providerScores.push(breakdown.meanOverall);
    }
    if (providerScores.length > 1) {
      stabilities.push(stabilityScore(providerScores));
    }
  }

  return stabilities.length > 0 ? mean(stabilities) : 100;
}

function computeDatasetStability(result: ExperimentResult): number {
  // Stability across runs within each variant (proxy for dataset stability)
  const stabilities: number[] = [];

  for (const variant of result.variants) {
    const scores = variant.runs.filter(r => !r.failed).map(r => r.overallScore);
    if (scores.length > 1) {
      stabilities.push(stabilityScore(scores));
    }
  }

  return stabilities.length > 0 ? mean(stabilities) : 100;
}

function computeOverallVariance(result: ExperimentResult): number {
  const allScores: number[] = [];
  for (const variant of result.variants) {
    for (const run of variant.runs) {
      if (!run.failed) {
        allScores.push(run.overallScore);
      }
    }
  }
  return allScores.length > 1 ? stdDev(allScores) ** 2 : 0;
}

// ── Overall Confidence Score ──

function computeOverallConfidenceScore(
  variantConfidence: VariantConfidenceDetail[],
  seedStability: number,
  providerStability: number,
  datasetStability: number,
  overallVariance: number,
): number {
  // Weights:
  // - Seed stability: 25%
  // - Provider stability: 15%
  // - Dataset stability: 25%
  // - Variance penalty: 20%
  // - Sample size: 15%

  const varianceScore = Math.max(0, 100 - overallVariance * 10); // Variance of 10 → score 0

  // Sample size score
  const minSamples = Math.min(...variantConfidence.map(v => v.sampleSize));
  const sampleScore = Math.min(100, (minSamples / 30) * 100); // 30+ runs = full score

  const score =
    0.25 * seedStability +
    0.15 * providerStability +
    0.25 * datasetStability +
    0.20 * varianceScore +
    0.15 * sampleScore;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── Significance ──

function determineSignificance(result: ExperimentResult, confidenceScore: number): boolean {
  // Must have at least 2 variants with results to compare
  if (result.variants.length < 2) return false;

  // Confidence must be at least 80%
  if (confidenceScore < 80) return false;

  // At least one pair must show significant difference
  const [v1, v2] = result.variants;
  const scores1 = v1.runs.filter(r => !r.failed).map(r => r.overallScore);
  const scores2 = v2.runs.filter(r => !r.failed).map(r => r.overallScore);

  if (scores1.length < 2 || scores2.length < 2) return false;

  const test = welchTTest(scores1, scores2);
  return test.significant;
}

// ── Helpers ──

function computeOverallInterval(result: ExperimentResult): [number, number] {
  const allScores: number[] = [];
  for (const variant of result.variants) {
    for (const run of variant.runs) {
      if (!run.failed) {
        allScores.push(run.overallScore);
      }
    }
  }
  return confidenceInterval95(allScores);
}

function formatConfidenceLevel(score: number): string {
  if (score >= 95) return '98%';
  if (score >= 90) return '95%';
  if (score >= 80) return '90%';
  if (score >= 70) return '80%';
  if (score >= 60) return '70%';
  return '<60%';
}
