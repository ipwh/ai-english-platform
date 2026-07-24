// ============================================
// Sprint 101: Quality Report
// Generates structured quality reports from QualityResult.
// ============================================

import type { QualityResult, QualityMetrics, SeverityBreakdown } from './quality-types';

export interface QualityReport {
  summary: {
    score: number;
    passed: boolean;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    timestamp: string;
    dimensions: {
      structure: number;
      consistency: number;
      pedagogy: number;
      assessment: number;
      repairability: number;
    };
  };
  details: {
    rulesChecked: number;
    rulesPassed: number;
    rulesFailed: number;
    warnings: string[];
    errors: string[];
    repairs: Array<{ ruleId: string; description: string; success: boolean }>;
    severity: SeverityBreakdown;
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
      dimensions: result.dimensions || {
        structure: result.score,
        consistency: result.score,
        pedagogy: result.score,
        assessment: result.score,
        repairability: result.score,
      },
    },
    details: {
      rulesChecked: result.metrics.rulesChecked,
      rulesPassed: result.metrics.rulesPassed,
      rulesFailed: result.metrics.rulesFailed,
      warnings: result.warnings,
      errors: result.errors,
      repairs: result.repairs,
      severity: result.severity || { info: 0, warning: 0, error: 0, critical: 0, fatal: 0 },
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
