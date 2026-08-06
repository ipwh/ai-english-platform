// ============================================
// Sprint 111: Output Calibration Types
// Deterministic post-LLM content improvement.
// ============================================

import { computeWeightedScore } from '@/shared/utils/weighted-score';

/** Calibration decision after scoring */
export type CalibrationDecision = 'PASS' | 'MINOR_CALIBRATION' | 'MAJOR_CALIBRATION' | 'REJECT';

/** Calibration score dimensions */
export interface CalibrationDimensions {
  completeness: number;   // Are all required fields present and filled?
  naturalness: number;    // Is language natural, not LLM-artifact-ridden?
  readability: number;    // Is formatting, spacing, punctuation clean?
  balance: number;        // Are MCQ options balanced? Answer distribution even?
  pedagogy: number;       // Are explanations, examples educationally sound?
  supportability: number; // Are reading/listening answers passage-supported?
  overall: number;        // Weighted average
}

export const CALIBRATION_WEIGHTS: Record<keyof Omit<CalibrationDimensions, 'overall'>, number> = {
  completeness: 0.25,
  naturalness: 0.20,
  readability: 0.15,
  balance: 0.10,
  pedagogy: 0.20,
  supportability: 0.10,
};

/** A single calibration check result */
export interface CalibrationCheck {
  ruleId: string;
  passed: boolean;
  /** What was changed (empty if passed) */
  changes: string[];
  score: number; // 0-1
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Affected question index (-1 = global) */
  questionIndex: number;
  /** Affected field name */
  field?: string;
}

/** Full calibration result for a batch of questions */
export interface CalibrationResult {
  decision: CalibrationDecision;
  dimensions: CalibrationDimensions;
  score: number; // 0-100
  checks: CalibrationCheck[];
  /** Number of questions that were modified */
  modifiedCount: number;
  /** Total changes made */
  totalChanges: number;
  warnings: string[];
  metadata: {
    totalChecks: number;
    passed: number;
    failed: number;
    durationMs: number;
    questionCount: number;
  };
}

/** Interface for calibration rules */
export interface CalibrationRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  /** Calibrate questions. Returns modified questions + checks. */
  calibrate(questions: Record<string, unknown>[]): {
    questions: Record<string, unknown>[];
    checks: CalibrationCheck[];
  };
}

/** Calculate calibration score from dimension scores */
export function calculateCalibrationScore(
  dims: Omit<CalibrationDimensions, 'overall'>,
): CalibrationDimensions {
  const overall = computeWeightedScore(dims as Record<string, number>, CALIBRATION_WEIGHTS as Record<string, number>);
  return { ...dims, overall };
}

/** Determine calibration decision from score */
export function determineCalibrationDecision(score: number): CalibrationDecision {
  if (score >= 90) return 'PASS';
  if (score >= 75) return 'MINOR_CALIBRATION';
  if (score >= 50) return 'MAJOR_CALIBRATION';
  return 'REJECT';
}

/** Create default dimensions (all 100 = perfect) */
export function createCalibrationDimensions(): Omit<CalibrationDimensions, 'overall'> {
  return { completeness: 100, naturalness: 100, readability: 100, balance: 100, pedagogy: 100, supportability: 100 };
}
