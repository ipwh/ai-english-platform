// ============================================
// Sprint 101: Quality Metrics
// In-memory metrics tracking for the AI Quality Layer.
// Complements (does not replace) runtime-metrics.ts.
// ============================================

import type { QualityMetrics } from './quality-types';

interface QualityStats {
  /** Total quality engine executions */
  totalExecutions: number;
  /** Total repairs attempted */
  totalRepairsAttempted: number;
  /** Total repairs succeeded */
  totalRepairsSucceeded: number;
  /** Total validation failures (rules that failed) */
  totalValidationFailures: number;
  /** Cumulative quality scores for averaging */
  cumulativeScore: number;
  /** Total warnings generated */
  totalWarnings: number;
  /** Total rule execution time in ms */
  totalExecutionTimeMs: number;
  /** Per-output-type breakdown */
  byOutputType: Record<string, {
    executions: number;
    avgScore: number;
    repairsAttempted: number;
    repairsSucceeded: number;
  }>;
  /** Per-rule statistics (Sprint 102) */
  byRule: Record<string, {
    passCount: number;
    failCount: number;
    repairCount: number;
    totalExecutionTimeMs: number;
    lastFailure?: string;
  }>;
}

const stats: QualityStats = {
  totalExecutions: 0,
  totalRepairsAttempted: 0,
  totalRepairsSucceeded: 0,
  totalValidationFailures: 0,
  cumulativeScore: 0,
  totalWarnings: 0,
  totalExecutionTimeMs: 0,
  byOutputType: {},
  byRule: {},
};

function ensureOutputType(type: string) {
  if (!stats.byOutputType[type]) {
    stats.byOutputType[type] = {
      executions: 0,
      avgScore: 0,
      repairsAttempted: 0,
      repairsSucceeded: 0,
    };
  }
  return stats.byOutputType[type];
}

/** Record metrics from a quality engine execution. */
export function recordQualityExecution(metrics: QualityMetrics): void {
  stats.totalExecutions++;
  stats.totalRepairsAttempted += metrics.repairsAttempted;
  stats.totalRepairsSucceeded += metrics.repairsSucceeded;
  stats.totalValidationFailures += metrics.rulesFailed;
  stats.cumulativeScore += metrics.score;
  stats.totalWarnings += metrics.warningsCount;
  stats.totalExecutionTimeMs += metrics.executionTimeMs;
}

/** Record per-output-type metrics. */
export function recordQualityExecutionForType(outputType: string, metrics: QualityMetrics): void {
  const typeStats = ensureOutputType(outputType);
  typeStats.executions++;
  typeStats.avgScore = ((typeStats.avgScore * (typeStats.executions - 1)) + metrics.score) / typeStats.executions;
  typeStats.repairsAttempted += metrics.repairsAttempted;
  typeStats.repairsSucceeded += metrics.repairsSucceeded;
  // Also record globally
  recordQualityExecution(metrics);
}

/** Record per-rule execution result. */
export function recordRuleExecution(
  ruleId: string,
  passed: boolean,
  executionTimeMs: number,
  repaired: boolean = false,
  failureMessage?: string,
): void {
  if (!stats.byRule[ruleId]) {
    stats.byRule[ruleId] = {
      passCount: 0,
      failCount: 0,
      repairCount: 0,
      totalExecutionTimeMs: 0,
    };
  }
  const r = stats.byRule[ruleId];
  if (passed) r.passCount++; else r.failCount++;
  if (repaired) r.repairCount++;
  r.totalExecutionTimeMs += executionTimeMs;
  if (failureMessage) r.lastFailure = failureMessage;
}

/** Get per-rule statistics. */
export function getRuleStatistics() {
  return Object.entries(stats.byRule).map(([ruleId, r]) => ({
    ruleId,
    passCount: r.passCount,
    failCount: r.failCount,
    passRate: (r.passCount + r.failCount) > 0
      ? Math.round((r.passCount / (r.passCount + r.failCount)) * 100) / 100
      : 0,
    repairCount: r.repairCount,
    avgExecutionTimeMs: (r.passCount + r.failCount) > 0
      ? Math.round(r.totalExecutionTimeMs / (r.passCount + r.failCount))
      : 0,
    lastFailure: r.lastFailure,
  }));
}

/** Get top failing rules (sorted by failure count descending). */
export function getTopFailingRules(limit: number = 5) {
  return getRuleStatistics()
    .filter(r => r.failCount > 0)
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, limit);
}

/** Get ruled statistics formatted for health endpoint. */
export function getRuleHealth() {
  const all = getRuleStatistics();
  return {
    registeredRules: all.length,
    ruleStatistics: all,
    topFailures: getTopFailingRules(5),
    repairCounts: all.reduce((acc, r) => acc + r.repairCount, 0),
    totalRuleExecutions: all.reduce((acc, r) => acc + r.passCount + r.failCount, 0),
  };
}

/** Get current quality metrics snapshot. */
export function getQualityMetrics() {
  return {
    totalExecutions: stats.totalExecutions,
    avgScore: stats.totalExecutions > 0
      ? Math.round((stats.cumulativeScore / stats.totalExecutions) * 100) / 100
      : 0,
    repairRate: stats.totalRepairsAttempted > 0
      ? Math.round((stats.totalRepairsSucceeded / stats.totalRepairsAttempted) * 100) / 100
      : 0,
    failureRate: stats.totalExecutions > 0
      ? Math.round((stats.totalValidationFailures / stats.totalExecutions) * 100) / 100
      : 0,
    avgExecutionTimeMs: stats.totalExecutions > 0
      ? Math.round(stats.totalExecutionTimeMs / stats.totalExecutions)
      : 0,
    totalWarnings: stats.totalWarnings,
    byOutputType: Object.entries(stats.byOutputType).map(([type, s]) => ({
      outputType: type,
      executions: s.executions,
      avgScore: Math.round(s.avgScore * 100) / 100,
      repairRate: s.repairsAttempted > 0 ? Math.round((s.repairsSucceeded / s.repairsAttempted) * 100) / 100 : 0,
    })),
    rules: getRuleHealth(),
  };
}

/** Reset all quality metrics. */
export function resetQualityMetrics(): void {
  stats.totalExecutions = 0;
  stats.totalRepairsAttempted = 0;
  stats.totalRepairsSucceeded = 0;
  stats.totalValidationFailures = 0;
  stats.cumulativeScore = 0;
  stats.totalWarnings = 0;
  stats.totalExecutionTimeMs = 0;
  stats.byOutputType = {};
}
