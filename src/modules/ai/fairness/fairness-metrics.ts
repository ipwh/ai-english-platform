// ============================================
// Sprint 112: Fairness Metrics
// Tracks grading fairness evaluations.
// ============================================

import type { FairnessResult } from './fairness-types';

interface RuleMetric {
  executions: number;
  failures: number;
  totalScore: number;
}

const ruleMetrics = new Map<string, RuleMetric>();

const overall = {
  totalEvaluations: 0,
  totalScore: 0,
  totalConfidence: 0,
  correctCount: 0,
  acceptCount: 0,
  partialCount: 0,
  incorrectCount: 0,
};

function ensureRule(id: string): RuleMetric {
  if (!ruleMetrics.has(id)) {
    ruleMetrics.set(id, { executions: 0, failures: 0, totalScore: 0 });
  }
  return ruleMetrics.get(id)!;
}

export function recordFairnessEvaluation(result: FairnessResult): void {
  overall.totalEvaluations++;
  overall.totalScore += result.score;
  overall.totalConfidence += result.confidence;

  switch (result.decision) {
    case 'correct': overall.correctCount++; break;
    case 'accept': overall.acceptCount++; break;
    case 'partially_correct': overall.partialCount++; break;
    case 'incorrect': overall.incorrectCount++; break;
  }
}

export function recordRuleExecution(ruleId: string, failed: boolean): void {
  const m = ensureRule(ruleId);
  m.executions++;
  if (failed) m.failures++;
}

export function getFairnessMetrics() {
  const t = overall.totalEvaluations || 1;
  const ruleStats = Array.from(ruleMetrics.entries())
    .map(([ruleId, m]) => ({
      ruleId,
      executions: m.executions,
      failures: m.failures,
      failureRate: m.executions > 0 ? Math.round((m.failures / m.executions) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.failures - a.failures);

  const mostTriggered = ruleStats.length > 0 ? ruleStats[0] : null;
  const falseNegativeRate = overall.incorrectCount / t;

  return {
    totalEvaluations: overall.totalEvaluations,
    avgScore: Math.round(overall.totalScore / t),
    avgConfidence: Math.round((overall.totalConfidence / t) * 100) / 100,
    correctRate: Math.round((overall.correctCount / t) * 100),
    acceptRate: Math.round((overall.acceptCount / t) * 100),
    partialRate: Math.round((overall.partialCount / t) * 100),
    incorrectRate: Math.round((overall.incorrectCount / t) * 100),
    falseNegativeReduction: Math.round(Math.max(0, (1 - falseNegativeRate) * 100)),
    partialCreditFrequency: Math.round((overall.partialCount / t) * 100),
    mostTriggeredRule: mostTriggered ? { ruleId: mostTriggered.ruleId, failures: mostTriggered.failures } : null,
    ruleStatistics: ruleStats,
  };
}

export function resetFairnessMetrics(): void {
  overall.totalEvaluations = 0;
  overall.totalScore = 0;
  overall.totalConfidence = 0;
  overall.correctCount = 0;
  overall.acceptCount = 0;
  overall.partialCount = 0;
  overall.incorrectCount = 0;
  ruleMetrics.clear();
}
