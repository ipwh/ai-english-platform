// ============================================
// Sprint 106: Assessment Types
// ============================================

import { computeWeightedScore } from '@/shared/utils/weighted-score';

/** Assessment decision for a generated question */
export type AssessmentDecision = 'approved' | 'warning' | 'repair_required' | 'rejected';

/** Five quality dimensions */
export interface AssessmentDimensions {
  validity: number;    // Is the question valid (correct answer, no ambiguity)?
  reliability: number; // Will it produce consistent results?
  fairness: number;    // Is it free from bias and cultural assumptions?
  difficulty: number;  // Does it match the target level?
  pedagogy: number;    // Is it educationally sound?
  overall: number;     // Weighted average
}

export const ASSESSMENT_WEIGHTS: Record<keyof Omit<AssessmentDimensions, 'overall'>, number> = {
  validity: 0.30,
  reliability: 0.20,
  fairness: 0.10,
  difficulty: 0.20,
  pedagogy: 0.20,
};

/** A single assessment check result */
export interface AssessmentCheck {
  ruleId: string;
  passed: boolean;
  score: number;   // 0-1
  message?: string;
  recommendation?: string;
  affectedField?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedRepairCost: number; // 0-100
}

/** Full assessment result */
export interface AssessmentResult {
  decision: AssessmentDecision;
  dimensions: AssessmentDimensions;
  score: number;     // 0-100
  checks: AssessmentCheck[];
  warnings: string[];
  errors: string[];
  recommendations: string[];
  metadata: { totalChecks: number; passed: number; failed: number; durationMs: number };
}

/** Interface for assessment rules */
export interface AssessmentRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  /** Assess a question and return a check result */
  assess(question: Record<string, unknown>, context?: AssessmentContext): AssessmentCheck;
}

/** Context for assessment */
export interface AssessmentContext {
  questionType?: string;
  targetLevel?: string;
  targetCEFR?: string;
  passageContent?: string;
  transcriptContent?: string;
  metadata?: Record<string, unknown>;
}

/** Compute dimension scores from checks */
export function calculateAssessmentScore(dimensions: Omit<AssessmentDimensions, 'overall'>): AssessmentDimensions {
  const overall = computeWeightedScore(dimensions as Record<string, number>, ASSESSMENT_WEIGHTS as Record<string, number>);
  return { ...dimensions, overall };
}

/** Determine decision from score and critical failures */
export function determineDecision(score: number, hasCriticalFailures: boolean, _hasHighFailures: boolean): AssessmentDecision {
  if (score >= 80 && !hasCriticalFailures) return 'approved';
  if (score >= 50 && !hasCriticalFailures) return 'warning';
  if (score >= 30 && !hasCriticalFailures) return 'repair_required';
  return 'rejected';
}
