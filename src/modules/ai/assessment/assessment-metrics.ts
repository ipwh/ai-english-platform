// ============================================
// Sprint 106: Assessment Metrics
// ============================================

import type { AssessmentDecision } from './assessment-types';

interface AssessMetrics {
  totalAssessments: number;
  approved: number; warned: number; repaired: number; rejected: number;
  totalLatencyMs: number;
  cumulativeScore: number;
  ruleResults: Record<string, { passed: number; failed: number }>;
}

const m: AssessMetrics = { totalAssessments: 0, approved: 0, warned: 0, repaired: 0, rejected: 0, totalLatencyMs: 0, cumulativeScore: 0, ruleResults: {} };

export function recordAssessment(decision: AssessmentDecision, score: number, latencyMs: number): void {
  m.totalAssessments++;
  if (decision === 'approved') m.approved++;
  else if (decision === 'warning') m.warned++;
  else if (decision === 'repair_required') m.repaired++;
  else m.rejected++;
  m.cumulativeScore += score;
  m.totalLatencyMs += latencyMs;
}

export function recordRuleResult(ruleId: string, passed: boolean): void {
  if (!m.ruleResults[ruleId]) m.ruleResults[ruleId] = { passed: 0, failed: 0 };
  if (passed) m.ruleResults[ruleId].passed++; else m.ruleResults[ruleId].failed++;
}

export function getAssessmentMetrics() {
  const t = m.totalAssessments || 1;
  return {
    totalAssessments: m.totalAssessments,
    approvalRate: Math.round((m.approved / t) * 100) / 100,
    repairRate: Math.round((m.repaired / t) * 100) / 100,
    rejectionRate: Math.round((m.rejected / t) * 100) / 100,
    avgQualityScore: Math.round((m.cumulativeScore / t) * 100) / 100,
    avgLatencyMs: Math.round(m.totalLatencyMs / t),
    topFailingRules: Object.entries(m.ruleResults).filter(([, r]) => r.failed > 0).sort((a, b) => b[1].failed - a[1].failed).slice(0, 5).map(([id, r]) => ({ ruleId: id, failed: r.failed, passRate: (r.passed + r.failed) > 0 ? Math.round((r.passed / (r.passed + r.failed)) * 100) / 100 : 0 })),
  };
}

export function resetAssessmentMetrics(): void {
  m.totalAssessments = 0; m.approved = 0; m.warned = 0; m.repaired = 0; m.rejected = 0;
  m.totalLatencyMs = 0; m.cumulativeScore = 0; m.ruleResults = {};
}
