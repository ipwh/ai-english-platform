// ============================================
// Sprint 114: Adaptive Metrics
// ============================================

import type { AdaptiveResult } from './adaptive-types';

interface RuleMetric { executions: number; failures: number; }
const ruleMetrics = new Map<string, RuleMetric>();

const overall = {
  totalEvaluations: 0, totalScore: 0,
  excellentCount: 0, goodCount: 0, acceptableCount: 0, needsAdjustmentCount: 0,
  reviewRecs: 0, practiceRecs: 0, advanceRecs: 0, revisionRecs: 0,
  difficultyTrend: [] as number[],
};

function ensureRule(id: string): RuleMetric {
  if (!ruleMetrics.has(id)) ruleMetrics.set(id, { executions: 0, failures: 0 });
  return ruleMetrics.get(id)!;
}

export function recordAdaptiveEvaluation(result: AdaptiveResult): void {
  overall.totalEvaluations++; overall.totalScore += result.score;
  switch (result.decision) {
    case 'excellent_adaptation': overall.excellentCount++; break;
    case 'good': overall.goodCount++; break;
    case 'acceptable': overall.acceptableCount++; break;
    case 'needs_adjustment': overall.needsAdjustmentCount++; break;
  }
  for (const rec of result.recommendations) {
    if (rec === 'review') overall.reviewRecs++;
    else if (rec === 'practice') overall.practiceRecs++;
    else if (rec === 'advance') overall.advanceRecs++;
    else if (rec === 'revision') overall.revisionRecs++;
  }
  overall.difficultyTrend.push(result.score);
  if (overall.difficultyTrend.length > 100) overall.difficultyTrend.shift();
}

export function recordRuleExecution(ruleId: string, failed: boolean): void {
  const m = ensureRule(ruleId); m.executions++; if (failed) m.failures++;
}

export function getAdaptiveMetrics() {
  const t = overall.totalEvaluations || 1;
  const ruleStats = Array.from(ruleMetrics.entries())
    .map(([ruleId, m]) => ({ ruleId, executions: m.executions, failures: m.failures,
      failureRate: m.executions > 0 ? Math.round((m.failures / m.executions) * 100) / 100 : 0 }))
    .sort((a, b) => b.failures - a.failures);

  const totalRecs = overall.reviewRecs + overall.practiceRecs + overall.advanceRecs + overall.revisionRecs || 1;

  return {
    totalEvaluations: overall.totalEvaluations,
    avgScore: Math.round(overall.totalScore / t),
    excellentRate: Math.round((overall.excellentCount / t) * 100),
    goodRate: Math.round((overall.goodCount / t) * 100),
    acceptableRate: Math.round((overall.acceptableCount / t) * 100),
    needsAdjustmentRate: Math.round((overall.needsAdjustmentCount / t) * 100),
    difficultyTrend: overall.difficultyTrend,
    recommendationDistribution: {
      review: Math.round((overall.reviewRecs / totalRecs) * 100),
      practice: Math.round((overall.practiceRecs / totalRecs) * 100),
      advance: Math.round((overall.advanceRecs / totalRecs) * 100),
      revision: Math.round((overall.revisionRecs / totalRecs) * 100),
    },
    weakSkillFrequency: ruleStats.find(r => r.ruleId === 'adp:weak-skill-focus')?.failures || 0,
    vocabularyRecyclingRate: ruleStats.find(r => r.ruleId === 'adp:vocabulary-recycling')?.failures || 0,
    grammarRecyclingRate: ruleStats.find(r => r.ruleId === 'adp:grammar-recycling')?.failures || 0,
    challengeRatio: { comfortable: 0.70, challenging: 0.20, stretch: 0.10 },
    ruleStatistics: ruleStats,
  };
}

export function resetAdaptiveMetrics(): void {
  overall.totalEvaluations = 0; overall.totalScore = 0;
  overall.excellentCount = 0; overall.goodCount = 0; overall.acceptableCount = 0; overall.needsAdjustmentCount = 0;
  overall.reviewRecs = 0; overall.practiceRecs = 0; overall.advanceRecs = 0; overall.revisionRecs = 0;
  overall.difficultyTrend = []; ruleMetrics.clear();
}
