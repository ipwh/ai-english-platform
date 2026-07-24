// ============================================
// Sprint 105: Evaluation Metrics
// ============================================

import type { GradingDecision } from './evaluation-types';

interface EvalMetrics {
  totalGradings: number;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  totalLatencyMs: number;
  ruleUsage: Record<string, { passed: number; failed: number }>;
  cumulativeSemanticScore: number;
  cumulativeKeywordScore: number;
}

const metrics: EvalMetrics = {
  totalGradings: 0,
  correctCount: 0,
  partialCount: 0,
  incorrectCount: 0,
  totalLatencyMs: 0,
  ruleUsage: {},
  cumulativeSemanticScore: 0,
  cumulativeKeywordScore: 0,
};

export function recordEvaluation(latencyMs: number): void {
  metrics.totalGradings++;
  metrics.totalLatencyMs += latencyMs;
}

export function recordGrading(decision: GradingDecision): void {
  if (decision === 'correct') metrics.correctCount++;
  else if (decision === 'partially_correct') metrics.partialCount++;
  else metrics.incorrectCount++;
}

export function recordRuleUsage(rule: string, passed: boolean): void {
  if (!metrics.ruleUsage[rule]) metrics.ruleUsage[rule] = { passed: 0, failed: 0 };
  if (passed) metrics.ruleUsage[rule].passed++;
  else metrics.ruleUsage[rule].failed++;
}

export function recordSemanticScore(score: number): void {
  metrics.cumulativeSemanticScore += score;
}

export function recordKeywordScore(score: number): void {
  metrics.cumulativeKeywordScore += score;
}

export function getEvaluationMetrics() {
  const total = metrics.totalGradings || 1;
  return {
    totalGradings: metrics.totalGradings,
    correctRate: Math.round((metrics.correctCount / total) * 100) / 100,
    partialRate: Math.round((metrics.partialCount / total) * 100) / 100,
    incorrectRate: Math.round((metrics.incorrectCount / total) * 100) / 100,
    falseNegativeEstimate: Math.round(((metrics.incorrectCount) / total) * 100) / 100,
    avgLatencyMs: Math.round(metrics.totalLatencyMs / total),
    avgSemanticScore: Math.round((metrics.cumulativeSemanticScore / total) * 100) / 100,
    avgKeywordScore: Math.round((metrics.cumulativeKeywordScore / total) * 100) / 100,
    ruleUsage: Object.entries(metrics.ruleUsage).map(([rule, u]) => ({
      rule,
      passed: u.passed,
      failed: u.failed,
      passRate: (u.passed + u.failed) > 0 ? Math.round((u.passed / (u.passed + u.failed)) * 100) / 100 : 0,
    })).sort((a, b) => b.passed + b.failed - (a.passed + a.failed)),
  };
}

export function resetEvaluationMetrics(): void {
  metrics.totalGradings = 0;
  metrics.correctCount = 0;
  metrics.partialCount = 0;
  metrics.incorrectCount = 0;
  metrics.totalLatencyMs = 0;
  metrics.ruleUsage = {};
  metrics.cumulativeSemanticScore = 0;
  metrics.cumulativeKeywordScore = 0;
}
