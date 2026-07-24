// ============================================
// Sprint 105: Evaluation Report
// ============================================

import type { EvaluationOutput } from './evaluation-types';
import { getEvaluationMetrics } from './evaluation-metrics';

export interface EvaluationReport {
  summary: {
    totalGradings: number;
    correctRate: number;
    partialRate: number;
    incorrectRate: number;
    avgSemanticScore: number;
    avgKeywordScore: number;
    avgLatencyMs: number;
  };
  gradingDistribution: {
    correct: number;
    partial: number;
    incorrect: number;
  };
  topTriggeredRules: Array<{ rule: string; passRate: number }>;
  recentEvaluations: Array<{
    studentAnswer: string;
    referenceAnswer: string;
    decision: string;
    overallScore: number;
  }>;
}

export function generateEvaluationReport(recentResults: EvaluationOutput[] = []): EvaluationReport {
  const m = getEvaluationMetrics();
  return {
    summary: {
      totalGradings: m.totalGradings,
      correctRate: m.correctRate,
      partialRate: m.partialRate,
      incorrectRate: m.incorrectRate,
      avgSemanticScore: m.avgSemanticScore,
      avgKeywordScore: m.avgKeywordScore,
      avgLatencyMs: m.avgLatencyMs,
    },
    gradingDistribution: {
      correct: Math.round(m.correctRate * m.totalGradings),
      partial: Math.round(m.partialRate * m.totalGradings),
      incorrect: Math.round(m.incorrectRate * m.totalGradings),
    },
    topTriggeredRules: m.ruleUsage.slice(0, 5).map(r => ({
      rule: r.rule,
      passRate: r.passRate,
    })),
    recentEvaluations: recentResults.slice(-5).map(r => ({
      studentAnswer: r.studentAnswer.slice(0, 60),
      referenceAnswer: r.referenceAnswer.slice(0, 60),
      decision: r.decision,
      overallScore: r.overallScore,
    })),
  };
}
