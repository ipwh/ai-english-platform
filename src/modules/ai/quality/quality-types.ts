// ============================================
// Sprint 101: AI Quality Layer — Core Types
// Rule-based engine for validating & repairing AI outputs.
// Additive only. No existing API changes.
// ============================================

// ═══ Quality Rule Interface ═══

/**
 * Priority of a quality rule. Higher priority rules execute first.
 * CRITICAL = must pass or output is rejected
 * HIGH = important, warn if fails
 * MEDIUM = best-effort check
 * LOW = informational only
 */
export type RulePriority = 'critical' | 'high' | 'medium' | 'low';

// ═══ Sprint 103: Quality Severity Levels ═══

/**
 * Severity of a quality issue. Used to classify rule failures.
 * INFO     = minor improvement opportunity
 * WARNING  = acceptable output with a quality issue
 * ERROR    = needs repair before grading
 * CRITICAL = cannot safely grade
 * FATAL    = reject entire AI output (unusable)
 */
export type QualitySeverity = 'info' | 'warning' | 'error' | 'critical' | 'fatal';

/**
 * Default severity for each rule priority level.
 */
export const PRIORITY_TO_SEVERITY: Record<RulePriority, QualitySeverity> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'fatal',
};

// ═══ Sprint 103: Quality Dimensions ═══

/**
 * Multi-dimensional quality scoring.
 * Each dimension is scored 0-100 independently.
 * Overall score is a weighted average.
 */
export interface QualityDimensions {
  /** Structural integrity: fields present, types correct, options valid */
  structure: number;
  /** Content consistency: answers match options, facts not contradictory */
  consistency: number;
  /** Pedagogical quality: age-appropriate, correct difficulty */
  pedagogy: number;
  /** Assessment validity: answerable, gradeable, no ambiguity */
  assessment: number;
  /** Repairability: can defects be auto-fixed? (100 = all fixable) */
  repairability: number;
  /** Overall weighted score */
  overall: number;
}

/** Default dimension weights for overall score calculation. */
export const DEFAULT_DIMENSION_WEIGHTS: Record<keyof Omit<QualityDimensions, 'overall'>, number> = {
  structure: 0.25,
  consistency: 0.30,
  pedagogy: 0.15,
  assessment: 0.20,
  repairability: 0.10,
};

/** Calculate overall quality score from dimension scores. */
export function calculateDimensionScore(
  dimensions: Omit<QualityDimensions, 'overall'>,
  weights: Record<string, number> = DEFAULT_DIMENSION_WEIGHTS,
): number {
  const weighted =
    (dimensions.structure * weights.structure) +
    (dimensions.consistency * weights.consistency) +
    (dimensions.pedagogy * weights.pedagogy) +
    (dimensions.assessment * weights.assessment) +
    (dimensions.repairability * weights.repairability);
  return Math.round(Math.max(0, Math.min(100, weighted)));
}

/** Create a full QualityDimensions from individual scores. */
export function createQualityDimensions(
  structure: number,
  consistency: number,
  pedagogy: number,
  assessment: number,
  repairability: number,
): QualityDimensions {
  const dims = { structure, consistency, pedagogy, assessment, repairability };
  return { ...dims, overall: calculateDimensionScore(dims) };
}

// ═══ Rule Validation Category (Sprint 103) ═══

/** Declares the validation approach for a rule. */
export type RuleCategory = 'deterministic' | 'heuristic' | 'ai-assisted';

/**
 * A registered quality rule. Every rule is independently registerable.
 * Future rules must implement this interface without modifying QualityEngine.
 */
export interface QualityRule<TInput = unknown> {
  /** Unique identifier. Convention: "category:check-name" */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** What this rule checks */
  readonly description: string;
  /** Execution priority */
  readonly priority: RulePriority;
  /** Which output types this rule supports (empty = all) */
  readonly supportedTypes: string[];
  /** Validation category: deterministic, heuristic, or ai-assisted */
  readonly category: RuleCategory;
  /** Which quality dimension this rule contributes to */
  readonly dimension: keyof QualityDimensions;
  /** Validate the input. Returns RuleCheckResult. */
  validate(input: TInput, context?: QualityContext): RuleCheckResult;
  /** Attempt to repair a failed check. Returns the repaired input or null if unrepairable. */
  repair?(input: TInput, failure: RuleFailure, context?: QualityContext): RepairResult<TInput>;
}

// ═══ Results ═══

export interface RuleFailure {
  ruleId: string;
  message: string;
  detail?: string;
}

export interface RuleCheckResult {
  passed: boolean;
  failures: RuleFailure[];
  warnings: string[];
}

export interface RepairResult<T = unknown> {
  repaired: boolean;
  output: T;
  changes: string[];
}

export interface QualityResult<T = unknown> {
  /** 0-100 quality score (backward compat) */
  score: number;
  /** Did all critical rules pass? */
  passed: boolean;
  /** All warnings from all rules */
  warnings: string[];
  /** All errors from failed critical rules */
  errors: string[];
  /** Repairs applied */
  repairs: RepairRecord[];
  /** The final (possibly repaired) output */
  output: T;
  /** Metrics collected during execution */
  metrics: QualityMetrics;
  /** Sprint 103: Multi-dimensional quality scores */
  dimensions: QualityDimensions;
  /** Sprint 103: Severity breakdown */
  severity: SeverityBreakdown;
}

export interface RepairRecord {
  ruleId: string;
  description: string;
  success: boolean;
}

export interface QualityMetrics {
  rulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  repairsAttempted: number;
  repairsSucceeded: number;
  warningsCount: number;
  errorsCount: number;
  executionTimeMs: number;
  score: number;
}

/** Sprint 103: Breakdown of failures by severity level. */
export interface SeverityBreakdown {
  info: number;
  warning: number;
  error: number;
  critical: number;
  fatal: number;
}

// ═══ Context ═══

export interface QualityContext {
  /** Output type being validated (e.g. "GeneratedQuestion", "AnswerAnalysis") */
  outputType: string;
  /** Request metadata for logging */
  requestId?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

// ═══ Quality Score ═══

/**
 * Calculate quality score from rule results.
 * Critical failures deduct heavily, high failures moderately, etc.
 */
export function calculateQualityScore(
  rulesChecked: number,
  criticalFailures: number,
  highFailures: number,
  mediumFailures: number,
  lowFailures: number,
  repairsApplied: number,
): number {
  if (rulesChecked === 0) return 100;

  const maxScore = 100;
  const criticalDeduction = criticalFailures * 25;
  const highDeduction = highFailures * 10;
  const mediumDeduction = mediumFailures * 5;
  const lowDeduction = lowFailures * 2;
  const repairBonus = Math.min(repairsApplied * 2, 10); // bonus for successful repairs

  return Math.max(0, Math.min(100, maxScore - criticalDeduction - highDeduction - mediumDeduction - lowDeduction + repairBonus));
}
