// ============================================
// Sprint 108: Optimization Metrics
// ============================================

import type { OptimizationDecision } from './optimization-types';

interface OptMetrics {
  total: number; approved: number; warned: number; optimized: number; regenLater: number; rejected: number;
  repairs: number; totalLatencyMs: number; cumulativeScore: number;
  rules: Record<string, { passed: number; failed: number; repaired: number }>;
}

const metricsData: OptMetrics = { total: 0, approved: 0, warned: 0, optimized: 0, regenLater: 0, rejected: 0, repairs: 0, totalLatencyMs: 0, cumulativeScore: 0, rules: {} };

export function recordOptimization(decision: OptimizationDecision, score: number, latencyMs: number, repairCount: number): void {
  metricsData.total++;
  if (decision === 'approved') metricsData.approved++; else if (decision === 'warning') metricsData.warned++;
  else if (decision === 'optimized') metricsData.optimized++; else if (decision === 'regenerate_later') metricsData.regenLater++;
  else metricsData.rejected++;
  metricsData.repairs += repairCount;
  metricsData.cumulativeScore += score;
  metricsData.totalLatencyMs += latencyMs;
}

export function recordRuleExecution(ruleId: string, passed: boolean, action: string): void {
  if (!metricsData.rules[ruleId]) metricsData.rules[ruleId] = { passed: 0, failed: 0, repaired: 0 };
  if (passed) metricsData.rules[ruleId].passed++; else metricsData.rules[ruleId].failed++;
  if (action === 'repair' || action === 'normalize') metricsData.rules[ruleId].repaired++;
}

export function getOptimizationMetrics() {
  const t = metricsData.total || 1;
  return {
    totalEvaluations: metricsData.total,
    approved: metricsData.approved,
    warned: metricsData.warned,
    optimized: metricsData.optimized,
    regenLater: metricsData.regenLater,
    rejected: metricsData.rejected,
    repairs: metricsData.repairs,
    avgScore: Math.round((metricsData.cumulativeScore / t) * 100) / 100,
    avgLatencyMs: Math.round(metricsData.totalLatencyMs / t),
    ruleStats: Object.entries(metricsData.rules).map(([id, r]) => ({
      ruleId: id, passed: r.passed, failed: r.failed, repaired: r.repaired,
      passRate: (r.passed + r.failed) > 0 ? Math.round((r.passed / (r.passed + r.failed)) * 100) / 100 : 0,
    })).sort((a, b) => b.failed - a.failed),
    topOptimizations: Object.entries(metricsData.rules).filter(([, r]) => r.repaired > 0).sort((a, b) => b[1].repaired - a[1].repaired).slice(0, 5).map(([id]) => id),
  };
}

export function resetOptimizationMetrics(): void {
  metricsData.total = 0;
  metricsData.approved = 0;
  metricsData.warned = 0;
  metricsData.optimized = 0;
  metricsData.regenLater = 0;
  metricsData.rejected = 0;
  metricsData.repairs = 0;
  metricsData.totalLatencyMs = 0;
  metricsData.cumulativeScore = 0;
  metricsData.rules = {};
}
