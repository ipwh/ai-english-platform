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
  /** 0-100 quality score */
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
