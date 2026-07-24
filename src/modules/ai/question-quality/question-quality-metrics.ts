// ============================================
// Sprint 113: Question Quality Metrics
// ============================================

import type { QuestionQualityResult } from './question-quality-types';

interface RuleMetric {
  executions: number;
  failures: number;
}

const ruleMetrics = new Map<string, RuleMetric>();

const overall = {
  totalEvaluations: 0,
  totalScore: 0,
  excellentCount: 0,
  goodCount: 0,
  acceptableCount: 0,
  needsImprovementCount: 0,
  totalQuestions: 0,
  totalFailures: 0,
};

function ensureRule(id: string): RuleMetric {
  if (!ruleMetrics.has(id)) {
    ruleMetrics.set(id, { executions: 0, failures: 0 });
  }
  return ruleMetrics.get(id)!;
}

export function recordQualityEvaluation(result: QuestionQualityResult): void {
  overall.totalEvaluations++;
  overall.totalScore += result.score;
  overall.totalQuestions += result.metadata.questionCount;
  overall.totalFailures += result.metadata.failed;

  switch (result.decision) {
    case 'excellent': overall.excellentCount++; break;
    case 'good': overall.goodCount++; break;
    case 'acceptable': overall.acceptableCount++; break;
    case 'needs_improvement': overall.needsImprovementCount++; break;
  }
}

export function recordRuleExecution(ruleId: string, failed: boolean, count: number): void {
  const m = ensureRule(ruleId);
  m.executions += count;
  if (failed) m.failures++;
}

export function getQuestionQualityMetrics() {
  const t = overall.totalEvaluations || 1;
  const ruleStats = Array.from(ruleMetrics.entries())
    .map(([ruleId, m]) => ({
      ruleId,
      executions: m.executions,
      failures: m.failures,
      failureRate: m.executions > 0 ? Math.round((m.failures / m.executions) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.failures - a.failures);

  return {
    totalEvaluations: overall.totalEvaluations,
    totalQuestions: overall.totalQuestions,
    avgScore: Math.round(overall.totalScore / t),
    avgFailuresPerQuestion: Math.round((overall.totalFailures / Math.max(1, overall.totalQuestions)) * 10) / 10,
    excellentRate: Math.round((overall.excellentCount / t) * 100),
    goodRate: Math.round((overall.goodCount / t) * 100),
    acceptableRate: Math.round((overall.acceptableCount / t) * 100),
    needsImprovementRate: Math.round((overall.needsImprovementCount / t) * 100),
    distractorFailures: ruleStats.filter(r => r.ruleId.includes('distractor') || r.ruleId.includes('option')).reduce((s, r) => s + r.failures, 0),
    ambiguousQuestions: ruleStats.filter(r => r.ruleId.includes('clarity') || r.ruleId.includes('stem')).reduce((s, r) => s + r.failures, 0),
    repeatedTemplates: ruleStats.filter(r => r.ruleId.includes('variety')).reduce((s, r) => s + r.failures, 0),
    difficultyDistribution: {
      tooEasy: ruleStats.find(r => r.ruleId === 'qq:difficulty-balance')?.failures || 0,
    },
    ruleStatistics: ruleStats,
  };
}

export function resetQuestionQualityMetrics(): void {
  overall.totalEvaluations = 0;
  overall.totalScore = 0;
  overall.excellentCount = 0;
  overall.goodCount = 0;
  overall.acceptableCount = 0;
  overall.needsImprovementCount = 0;
  overall.totalQuestions = 0;
  overall.totalFailures = 0;
  ruleMetrics.clear();
}
