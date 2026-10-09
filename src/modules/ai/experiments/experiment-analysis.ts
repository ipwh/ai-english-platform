// ============================================
// Experiment Analysis — deep analysis of results,
// risk assessment, and recommendations.
// ============================================

import type {
  ExperimentResult, ExperimentAnalysis,
  RiskAssessment, VariantAnalysis,
  ProviderAnalysis, SensitivityAnalysis,
} from './experiment';
import {
  mean, stdDev, detectOutliers, coefficientOfVariation,
} from './statistics';
import { rankVariants } from './winner-selection';
import { compareAllVariants } from './experiment-comparison';

// ── Public API ──

/**
 * Perform deep analysis on experiment results.
 * Returns structured findings, strengths/weaknesses,
 * risk assessment, and recommendations.
 */
export function analyzeExperiment(result: ExperimentResult): ExperimentAnalysis {
  const ranked = rankVariants(result);
  const comparisons = compareAllVariants(result);

  return {
    experimentId: result.experimentId,
    summary: generateSummary(result, ranked),
    findings: generateFindings(result, ranked, comparisons),
    recommendations: generateRecommendations(result, ranked),
    riskAssessment: assessRisk(result, ranked),
    variantAnalysis: analyzeVariants(result),
    providerAnalysis: analyzeProviders(result),
    sensitivity: analyzeSensitivity(result),
  };
}

// ── Summary ──

function generateSummary(
  result: ExperimentResult,
  ranked: ReturnType<typeof rankVariants>,
): string {
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const spread = best.meanOverall - worst.meanOverall;

  let summary = `Experiment "${result.experimentName}" compared ${result.variants.length} variants across ${result.totalRuns} runs. `;

  if (result.winner?.isSignificant && result.winner.variantId) {
    summary += `${result.winner.label} won with overall score ${best.meanOverall.toFixed(1)} `;
    summary += `(Δ=${result.winner.scoreDelta.toFixed(1)}, confidence ${result.confidence.level}). `;
  } else {
    summary += `No statistically significant winner was identified. `;
  }

  summary += `Score spread: ${spread.toFixed(1)} points (${best.label}: ${best.meanOverall.toFixed(1)} → ${worst.label}: ${worst.meanOverall.toFixed(1)}).`;

  return summary;
}

// ── Findings ──

function generateFindings(
  result: ExperimentResult,
  ranked: ReturnType<typeof rankVariants>,
  comparisons: ReturnType<typeof compareAllVariants>,
): string[] {
  const findings: string[] = [];

  // Finding 1: Winner margin
  if (ranked.length >= 2) {
    const delta = ranked[0].meanOverall - ranked[1].meanOverall;
    if (delta > 5) {
      findings.push(`Clear winner: ${ranked[0].label} leads by ${delta.toFixed(1)} points (large margin).`);
    } else if (delta > 2) {
      findings.push(`Moderate lead: ${ranked[0].label} leads by ${delta.toFixed(1)} points.`);
    } else {
      findings.push(`Tight race: ${ranked[0].label} leads by only ${delta.toFixed(1)} points — within noise range.`);
    }
  }

  // Finding 2: Stability
  for (const v of result.variants) {
    const cv = coefficientOfVariation(v.runs.filter(r => !r.failed).map(r => r.overallScore));
    if (cv > 0.1) {
      findings.push(`High variability: ${v.label} has CV=${(cv * 100).toFixed(1)}% — scores are inconsistent across runs.`);
    }
  }

  // Finding 3: Failures
  for (const v of result.variants) {
    if (v.failedRuns > 0) {
      const failRate = ((v.failedRuns / v.totalRuns) * 100).toFixed(1);
      findings.push(`${v.label}: ${v.failedRuns}/${v.totalRuns} runs failed (${failRate}% failure rate).`);
    }
  }

  // Finding 4: Significant pairwise differences
  const significantPairs = comparisons.filter(c => c.significant);
  if (significantPairs.length > 0) {
    findings.push(`${significantPairs.length} of ${comparisons.length} pairwise comparisons are statistically significant.`);
  } else {
    findings.push('No pairwise comparisons reached statistical significance — increase sample size.');
  }

  // Finding 5: Cost efficiency
  if (result.variants.length >= 2) {
    const best = ranked[0];
    const cheapest = [...result.variants].sort((a, b) => a.meanCostUsd - b.meanCostUsd)[0];
    if (cheapest.variantId !== best.variantId) {
      const costDiff = best.meanCostUsd - cheapest.meanCostUsd;
      findings.push(`Cost tradeoff: ${best.label} wins but ${cheapest.label} is $${costDiff.toFixed(4)} cheaper per run.`);
    }
  }

  return findings;
}

// ── Recommendations ──

function generateRecommendations(
  result: ExperimentResult,
  ranked: ReturnType<typeof rankVariants>,
): string[] {
  const recommendations: string[] = [];

  if (result.winner?.isSignificant && result.winner.variantId) {
    recommendations.push(
      `✅ Promote ${result.winner.label} (${result.winner.variantId}) — it is the statistically significant winner with ${result.confidence.level} confidence.`,
    );
  } else {
    recommendations.push(
      `⚠️ No clear winner — consider increasing sample size (current: ${result.totalRuns} runs) or adding more seeds for statistical power.`,
    );
  }

  // Stability recommendation
  const unstableVariants = result.variants.filter(v => {
    const cv = coefficientOfVariation(v.runs.filter(r => !r.failed).map(r => r.overallScore));
    return cv > 0.08;
  });
  if (unstableVariants.length > 0) {
    recommendations.push(
      `🔍 Investigate instability in: ${unstableVariants.map(v => v.label).join(', ')} — high score variance may indicate prompt sensitivity.`,
    );
  }

  // Provider recommendation
  const providerScores = new Map<string, { score: number; cost: number }>();
  for (const v of result.variants) {
    for (const [provider, breakdown] of Object.entries(v.providerBreakdown)) {
      const existing = providerScores.get(provider);
      if (!existing || breakdown.meanOverall > existing.score) {
        providerScores.set(provider, {
          score: breakdown.meanOverall,
          cost: mean(v.runs.filter(r => r.provider === provider).map(r => r.costUsd)),
        });
      }
    }
  }
  const bestProvider = [...providerScores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  if (bestProvider) {
    recommendations.push(`💡 Best provider: ${bestProvider[0]} (score: ${bestProvider[1].score.toFixed(1)})`);
  }

  return recommendations;
}

// ── Risk Assessment ──

function assessRisk(
  result: ExperimentResult,
  ranked: ReturnType<typeof rankVariants>,
): RiskAssessment {
  const factors: string[] = [];
  let score = 0;

  // Factor 1: Winner margin
  if (ranked.length >= 2) {
    const margin = ranked[0].meanOverall - ranked[1].meanOverall;
    if (margin < 1) { score += 30; factors.push('Very narrow winner margin (<1 point)'); }
    else if (margin < 3) { score += 15; factors.push('Narrow winner margin (<3 points)'); }
  }

  // Factor 2: Confidence
  if (result.confidence.score < 70) { score += 30; factors.push('Low confidence (<70%)'); }
  else if (result.confidence.score < 85) { score += 15; factors.push('Moderate confidence (<85%)'); }

  // Factor 3: Failure rate
  for (const v of result.variants) {
    if (v.failedRuns / v.totalRuns > 0.1) {
      score += 20;
      factors.push(`High failure rate in ${v.label} (${((v.failedRuns / v.totalRuns) * 100).toFixed(0)}%)`);
      break;
    }
  }

  // Factor 4: Seed stability
  if (result.confidence.seedStability < 70) { score += 20; factors.push('Low seed stability (<70%)'); }

  // Factor 5: Sample size
  if (result.totalRuns < 30) { score += 10; factors.push('Small sample size (<30 runs)'); }

  const level: RiskAssessment['level'] =
    score >= 60 ? 'critical' :
    score >= 35 ? 'high' :
    score >= 15 ? 'medium' : 'low';

  return { level, score, factors };
}

// ── Variant Analysis ──

function analyzeVariants(result: ExperimentResult): VariantAnalysis[] {
  return result.variants.map(v => {
    const scores = v.runs.filter(r => !r.failed).map(r => r.overallScore);
    const outliers = detectOutliers(scores);
    const outlierRate = scores.length > 0 ? (outliers.length / scores.length) * 100 : 0;

    // Determine trend (if multiple runs): compare first half vs second half
    const half = Math.floor(scores.length / 2);
    let scoreTrend: VariantAnalysis['scoreTrend'] = 'stable';
    if (half >= 3) {
      const firstHalf = mean(scores.slice(0, half));
      const secondHalf = mean(scores.slice(half));
      if (secondHalf - firstHalf > 1) scoreTrend = 'improving';
      else if (firstHalf - secondHalf > 1) scoreTrend = 'declining';
    }

    // Strengths & weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (v.meanStructural >= 90) strengths.push('Excellent structural compliance');
    if (v.meanStructural < 80) weaknesses.push('Below-average structural score');

    if (v.meanSemantic >= 85) strengths.push('Strong semantic similarity');
    if (v.meanSemantic < 75) weaknesses.push('Weak semantic similarity');

    if (v.successRate >= 0.95) strengths.push('High reliability (≥95% success)');
    if (v.successRate < 0.85) weaknesses.push(`Low reliability (${(v.successRate * 100).toFixed(0)}% success)`);

    if (v.stdDevOverall < 2) strengths.push('Very consistent scores (stdDev < 2)');
    if (v.stdDevOverall > 5) weaknesses.push('High score variance (stdDev > 5)');

    if (v.meanLatencyMs < 2000) strengths.push('Fast response time (<2s)');
    if (v.meanLatencyMs > 5000) weaknesses.push('Slow response time (>5s)');

    return {
      variantId: v.variantId,
      strengths,
      weaknesses,
      scoreTrend,
      outlierRate,
    };
  });
}

// ── Provider Analysis ──

function analyzeProviders(result: ExperimentResult): ProviderAnalysis[] {
  const providerMap = new Map<string, {
    scores: number[];
    latencies: number[];
    costs: number[];
    successes: number;
    total: number;
  }>();

  for (const v of result.variants) {
    for (const run of v.runs) {
      const p = providerMap.get(run.provider) ?? {
        scores: [], latencies: [], costs: [], successes: 0, total: 0,
      };
      if (!run.failed) {
        p.scores.push(run.overallScore);
        p.latencies.push(run.latencyMs);
        p.costs.push(run.costUsd);
        p.successes++;
      }
      p.total++;
      providerMap.set(run.provider, p);
    }
  }

  return [...providerMap.entries()].map(([provider, data]) => {
    const avgScore = mean(data.scores);
    const avgLatency = mean(data.latencies);
    const avgCost = mean(data.costs);
    const reliability = (data.successes / data.total) * 100;
    const costEfficiency = avgCost > 0 ? avgScore / avgCost : avgScore;

    const bestFor: string[] = [];
    if (avgScore >= 90) bestFor.push('high-quality generation');
    if (avgLatency < 2000) bestFor.push('low-latency use cases');
    if (costEfficiency > 50000) bestFor.push('cost-sensitive workloads');
    if (reliability >= 95) bestFor.push('production-critical paths');

    return {
      provider,
      reliability,
      avgLatency,
      costEfficiency,
      bestFor: bestFor.length > 0 ? bestFor : ['general use'],
    };
  });
}

// ── Sensitivity Analysis ──

function analyzeSensitivity(result: ExperimentResult): SensitivityAnalysis {
  // Seed sensitivity: how much scores vary across seeds
  const seedVariabilities: number[] = [];
  for (const v of result.variants) {
    const seedMeans = Object.values(v.seedBreakdown).map(b => b.meanOverall);
    if (seedMeans.length > 1) {
      seedVariabilities.push(stdDev(seedMeans));
    }
  }
  const seedSensitivity = seedVariabilities.length > 0
    ? Math.min(100, mean(seedVariabilities) * 10)
    : 0;

  // Temperature sensitivity: inferred from score variance
  const tempSensitivity = result.variants.length > 0
    ? mean(result.variants.map(v => v.stdDevOverall)) * 10
    : 0;

  // Minimum runs for significance (power analysis approximation)
  const minRuns = estimateMinRuns(result);

  return {
    seedSensitivity: Math.round(seedSensitivity),
    temperatureSensitivity: Math.round(tempSensitivity),
    minRunsForSignificance: minRuns,
  };
}

function estimateMinRuns(result: ExperimentResult): number {
  // Simple power analysis: based on observed effect size and variance
  if (result.variants.length < 2) return 30;

  const best = result.variants.reduce((a, b) => a.meanOverall > b.meanOverall ? a : b);
  const worst = result.variants.reduce((a, b) => a.meanOverall < b.meanOverall ? a : b);
  const effectSize = best.meanOverall - worst.meanOverall;
  const pooledStd = Math.sqrt((best.varianceOverall + worst.varianceOverall) / 2);

  if (pooledStd === 0) return 5;

  // For 80% power, α=0.05: n ≈ 16 * (σ² / δ²)
  const estimated = Math.ceil(16 * (pooledStd ** 2) / (effectSize ** 2));
  return Math.max(5, Math.min(500, estimated));
}
