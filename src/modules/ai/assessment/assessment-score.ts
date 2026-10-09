// ============================================
// Sprint 106: Assessment Score & Report
// ============================================

import type { AssessmentResult, AssessmentDimensions } from './assessment-types';

/** Generate a human-readable assessment score summary. */
export function formatAssessmentScore(result: AssessmentResult): string {
  const d = result.dimensions;
  return [
    `Score: ${result.score}/100`,
    `Decision: ${result.decision.toUpperCase()}`,
    `Validity: ${d.validity} | Reliability: ${d.reliability} | Fairness: ${d.fairness} | Difficulty: ${d.difficulty} | Pedagogy: ${d.pedagogy}`,
    `Checks: ${result.metadata.passed}/${result.metadata.totalChecks} passed`,
    result.errors.length > 0 ? `Errors: ${result.errors.slice(0, 3).join('; ')}` : '',
  ].filter(Boolean).join(' | ');
}

/** Generate a structured assessment report. */
export function generateAssessmentReport(results: AssessmentResult[]): {
  summary: { total: number; approved: number; warned: number; repaired: number; rejected: number; avgScore: number };
  distribution: Array<{ range: string; count: number }>;
  topFailingRules: Array<{ ruleId: string; failures: number }>;
  dimensionAverages: AssessmentDimensions;
  recentAssessments: Array<{ score: number; decision: string; errors: string[] }>;
} {
  const total = results.length || 1;
  const approved = results.filter(r => r.decision === 'approved').length;
  const warned = results.filter(r => r.decision === 'warning').length;
  const repaired = results.filter(r => r.decision === 'repair_required').length;
  const rejected = results.filter(r => r.decision === 'rejected').length;

  // Quality distribution
  const distribution = [
    { range: '90-100', count: results.filter(r => r.score >= 90).length },
    { range: '70-89', count: results.filter(r => r.score >= 70 && r.score < 90).length },
    { range: '50-69', count: results.filter(r => r.score >= 50 && r.score < 70).length },
    { range: '30-49', count: results.filter(r => r.score >= 30 && r.score < 50).length },
    { range: '0-29', count: results.filter(r => r.score < 30).length },
  ];

  // Top failing rules
  const ruleFailures = new Map<string, number>();
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) ruleFailures.set(c.ruleId, (ruleFailures.get(c.ruleId) || 0) + 1);
    }
  }
  const topFailingRules = [...ruleFailures.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ruleId, failures]) => ({ ruleId, failures }));

  // Average dimensions
  const avgDimensions: AssessmentDimensions = {
    validity: avg(results.map(r => r.dimensions.validity)),
    reliability: avg(results.map(r => r.dimensions.reliability)),
    fairness: avg(results.map(r => r.dimensions.fairness)),
    difficulty: avg(results.map(r => r.dimensions.difficulty)),
    pedagogy: avg(results.map(r => r.dimensions.pedagogy)),
    overall: avg(results.map(r => r.dimensions.overall)),
  };

  return {
    summary: { total, approved, warned, repaired, rejected, avgScore: Math.round(results.reduce((s, r) => s + r.score, 0) / total) },
    distribution,
    topFailingRules,
    dimensionAverages: avgDimensions,
    recentAssessments: results.slice(-5).map(r => ({ score: r.score, decision: r.decision, errors: r.errors.slice(0, 3) })),
  };
}

function avg(nums: number[]): number {
  return nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}
