// ============================================
// Sprint 111: Calibration Metrics
// Tracks calibration operations and rule statistics.
// ============================================

import type { CalibrationResult } from './calibration-types';

interface RuleMetric {
  executions: number;
  failures: number;
  totalChanges: number;
}

const ruleMetrics = new Map<string, RuleMetric>();

const overall = {
  totalCalibrations: 0,
  totalScore: 0,
  totalQuestions: 0,
  totalChanges: 0,
  totalAnswerLength: 0,
  totalExplanationLength: 0,
};

function ensureRule(id: string): RuleMetric {
  if (!ruleMetrics.has(id)) {
    ruleMetrics.set(id, { executions: 0, failures: 0, totalChanges: 0 });
  }
  return ruleMetrics.get(id)!;
}

/** Record a calibration result */
export function recordCalibration(result: CalibrationResult): void {
  overall.totalCalibrations++;
  overall.totalScore += result.score;
  overall.totalQuestions += result.metadata.questionCount;
  overall.totalChanges += result.totalChanges;

  for (const check of result.checks) {
    if (check.field === 'answer') overall.totalAnswerLength++;
    if (check.field === 'explanation' || check.field === 'explanationEn' || check.field === 'explanationZh') {
      overall.totalExplanationLength++;
    }
  }
}

/** Record a rule execution */
export function recordRuleExecution(ruleId: string, failed: boolean, execCount: number): void {
  const m = ensureRule(ruleId);
  m.executions += execCount;
  if (failed) m.failures++;
  m.totalChanges += failed ? 1 : 0;
}

/** Get calibration metrics */
export function getCalibrationMetrics() {
  const t = overall.totalCalibrations || 1;
  const q = overall.totalQuestions || 1;

  const ruleStats = Array.from(ruleMetrics.entries())
    .map(([ruleId, m]) => ({
      ruleId,
      executions: m.executions,
      failures: m.failures,
      failureRate: m.executions > 0 ? Math.round((m.failures / m.executions) * 100) / 100 : 0,
      totalChanges: m.totalChanges,
    }))
    .sort((a, b) => b.failures - a.failures);

  const mostCommon = ruleStats.length > 0 ? ruleStats[0] : null;

  return {
    totalCalibrations: overall.totalCalibrations,
    totalQuestions: overall.totalQuestions,
    avgCalibrationScore: Math.round(overall.totalScore / t),
    avgAnswerLength: Math.round(overall.totalAnswerLength / t),
    avgExplanationLength: Math.round(overall.totalExplanationLength / t),
    totalChanges: overall.totalChanges,
    mostCommonRule: mostCommon ? { ruleId: mostCommon.ruleId, failures: mostCommon.failures } : null,
    improvementRate: overall.totalChanges > 0
      ? Math.round(Math.min(100, (overall.totalChanges / overall.totalQuestions) * 20))
      : 0,
    ruleStatistics: ruleStats,
  };
}

/** Reset all metrics */
export function resetCalibrationMetrics(): void {
  overall.totalCalibrations = 0;
  overall.totalScore = 0;
  overall.totalQuestions = 0;
  overall.totalChanges = 0;
  overall.totalAnswerLength = 0;
  overall.totalExplanationLength = 0;
  ruleMetrics.clear();
}
