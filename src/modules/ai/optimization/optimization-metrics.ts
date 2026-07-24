// ============================================
// Sprint 108: Optimization Metrics
// ============================================

import type { OptimizationDecision } from './optimization-types';

interface OptMetrics {
  total: number; approved: number; warned: number; optimized: number; regenLater: number; rejected: number;
  repairs: number; totalLatencyMs: number; cumulativeScore: number;
  rules: Record<string, { passed: number; failed: number; repaired: number }>;
}

const m: OptMetrics = { total: 0, approved: 0, warned: 0, optimized: 0, regenLater: 0, rejected: 0, repairs: 0, totalLatencyMs: 0, cumulativeScore: 0, rules: {} };

export function recordOptimization(decision: OptimizationDecision, score: number, latencyMs: number, repairCount: number): void {
  m.total++;
  if (decision === 'approved') m.approved++; else if (decision === 'warning') m.warned++;
  else if (decision === 'optimized') m.optimized++; else if (decision === 'regenerate_later') m.regenLater++;
  else m.rejected++;
  m.repairs += repairCount;
  m.cumulativeScore += score;
  m.totalLatencyMs += latencyMs;
}

export function recordRuleExecution(ruleId: string, passed: boolean, action: string): void {
  if (!m.rules[ruleId]) m.rules[ruleId] = { passed: 0, failed: 0, repaired: 0 };
  if (passed) m.rules[ruleId].passed++; else m.rules[ruleId].failed++;
  if (action === 'repair' || action === 'normalize') m.rules[ruleId].repaired++;
}

export function getOptimizationMetrics() {
  const t = m.total || 1;
  return {
    totalEvaluations: m.total, approved: m.approved, warned: m.warned, optimized: m.optimized, regenLater: m.regenLater, rejected: m.rejected,
    repairs: m.repairs, avgScore: Math.round((m.cumulativeScore / t) * 100) / 100,
    avgLatencyMs: Math.round(m.totalLatencyMs / t),
    ruleStats: Object.entries(m.rules).map(([id, r]) => ({
      ruleId: id, passed: r.passed, failed: r.failed, repaired: r.repaired,
      passRate: (r.passed + r.failed) > 0 ? Math.round((r.passed / (r.passed + r.failed)) * 100) / 100 : 0,
    })).sort((a, b) => b.failed - a.failed),
    topOptimizations: Object.entries(m.rules).filter(([, r]) => r.repaired > 0).sort((a, b) => b[1].repaired - a[1].repaired).slice(0, 5).map(([id]) => id),
  };
}

export function resetOptimizationMetrics(): void {
  m.total = 0; m.approved = 0; m.warned = 0; m.optimized = 0; m.regenLater = 0; m.rejected = 0;
  m.repairs = 0; m.totalLatencyMs = 0; m.cumulativeScore = 0; m.rules = {};
}
