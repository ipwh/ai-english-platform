// ============================================
// Sprint 101: Quality Report
// Generates structured quality reports from QualityResult.
// ============================================

import type { QualityResult, QualityMetrics } from './quality-types';

export interface QualityReport {
  summary: {
    score: number;
    passed: boolean;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    timestamp: string;
  };
  details: {
    rulesChecked: number;
    rulesPassed: number;
    rulesFailed: number;
    warnings: string[];
    errors: string[];
    repairs: Array<{ ruleId: string; description: string; success: boolean }>;
  };
  metrics: QualityMetrics;
}

/**
 * Convert a quality score (0-100) to a letter grade.
 */
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

/**
 * Generate a structured quality report from a QualityResult.
 */
export function generateQualityReport<T>(result: QualityResult<T>): QualityReport {
  return {
    summary: {
      score: result.score,
      passed: result.passed,
      grade: scoreToGrade(result.score),
      timestamp: new Date().toISOString(),
    },
    details: {
      rulesChecked: result.metrics.rulesChecked,
      rulesPassed: result.metrics.rulesPassed,
      rulesFailed: result.metrics.rulesFailed,
      warnings: result.warnings,
      errors: result.errors,
      repairs: result.repairs,
    },
    metrics: result.metrics,
  };
}

/**
 * Generate a minimal quality summary string for logging.
 */
export function formatQualitySummary(result: QualityResult): string {
  const grade = scoreToGrade(result.score);
  const parts = [
    `Quality: ${result.score}/100 (${grade})`,
    `${result.metrics.rulesChecked} rules checked`,
    `${result.metrics.rulesFailed} failed`,
    `${result.metrics.repairsSucceeded} repairs applied`,
    result.passed ? 'PASSED' : 'FAILED',
  ];
  return parts.join(' | ');
}
