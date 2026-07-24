// ============================================
// Sprint 115: Human Review Metrics
// ============================================

import type { HumanReviewResult } from './human-review-types';

interface RuleMetric { executions: number; failures: number; }
const ruleMetrics = new Map<string, RuleMetric>();

const overall = {
  totalReviews: 0, totalScore: 0, totalLatency: 0,
  excellentCount: 0, goodCount: 0, acceptableCount: 0, needsImprovementCount: 0, rejectCount: 0,
  passCount: 0, failCount: 0,
};

function ensureRule(id: string): RuleMetric {
  if (!ruleMetrics.has(id)) ruleMetrics.set(id, { executions: 0, failures: 0 });
  return ruleMetrics.get(id)!;
}

export function recordHumanReview(result: HumanReviewResult): void {
  overall.totalReviews++; overall.totalScore += result.score;
  overall.totalLatency += result.metadata.durationMs;
  switch (result.decision) {
    case 'excellent': overall.excellentCount++; break;
    case 'good': overall.goodCount++; break;
    case 'acceptable': overall.acceptableCount++; break;
    case 'needs_improvement': overall.needsImprovementCount++; break;
    case 'reject': overall.rejectCount++; break;
  }
  if (result.decision === 'excellent' || result.decision === 'good') overall.passCount++;
  else overall.failCount++;
}

export function recordRuleExecution(ruleId: string, failed: boolean, count: number): void {
  const m = ensureRule(ruleId); m.executions += count; if (failed) m.failures++;
}

export function getHumanReviewMetrics() {
  const t = overall.totalReviews || 1;
  const ruleStats = Array.from(ruleMetrics.entries())
    .map(([rid, m]) => ({ ruleId: rid, executions: m.executions, failures: m.failures,
      failureRate: m.executions > 0 ? Math.round((m.failures / m.executions) * 100) / 100 : 0 }))
    .sort((a, b) => b.failures - a.failures);

  return {
    totalReviews: overall.totalReviews,
    avgScore: Math.round(overall.totalScore / t),
    passRate: Math.round((overall.passCount / t) * 100),
    failRate: Math.round((overall.failCount / t) * 100),
    excellentRate: Math.round((overall.excellentCount / t) * 100),
    goodRate: Math.round((overall.goodCount / t) * 100),
    acceptableRate: Math.round((overall.acceptableCount / t) * 100),
    needsImprovementRate: Math.round((overall.needsImprovementCount / t) * 100),
    rejectRate: Math.round((overall.rejectCount / t) * 100),
    avgLatencyMs: Math.round(overall.totalLatency / t),
    topFailedRules: ruleStats.filter(r => r.failures > 0).slice(0, 5).map(r => r.ruleId),
    topIssues: ruleStats.slice(0, 5).map(r => ({ ruleId: r.ruleId, failures: r.failures })),
    ruleStatistics: ruleStats,
  };
}

export function resetHumanReviewMetrics(): void {
  overall.totalReviews = 0; overall.totalScore = 0; overall.totalLatency = 0;
  overall.excellentCount = 0; overall.goodCount = 0; overall.acceptableCount = 0;
  overall.needsImprovementCount = 0; overall.rejectCount = 0;
  overall.passCount = 0; overall.failCount = 0; ruleMetrics.clear();
}
