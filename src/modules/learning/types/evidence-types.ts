// ============================================
// Sprint 131: Domain-Level LearningEvidence Contract
// ============================================
// **NUMERIC mastery evidence** contract for the learning domain.
// This is NOT a generic evidence container — `value` is always a
// mastery score (number | null). Do NOT use for categorical, textual,
// or boolean evidence.
//
// Classifies *how* we know a student's skill value, independently of
// any decision pipeline or scoring formula.
//
// Design invariants:
// 1. `value` is always nullable — `unknown` kind MUST have `null` value
//    (no numeric fallback; absence of evidence is not zero).
// 2. Every evidence record carries provenance/source.
// 3. Confidence is optional but encouraged for derived/estimated/predicted.
// 4. `createdAt` is always required (when the evidence record was created).
// 5. `assessmentId` ties evidence to a specific assessment context.
// 6. This contract is a pure type layer — no scoring, no migration of
//    existing consumers in this sprint.
// 7. EvidenceKind is an epistemic CLASSIFICATION, NOT a quality ranking.
//    Kind alone does NOT determine which evidence is "better."
// ============================================

// ============================================
// EvidenceKind — the epistemic classification
// ============================================

/**
 * How we know the student's skill value.
 *
 * **Classification, NOT quality ranking.** `kind` tells you the
 * epistemic source — it does NOT tell you whether the value is
 * reliable. A `derived` value from 200 observations may be more
 * trustworthy than an `observed` value from 3 data points.
 * Use `confidence` + `sampleSize` for quality judgments.
 *
 * - `unknown`:    No evidence exists. value MUST be null.
 * - `observed`:   Direct measurement (test score, practice result, teacher grade).
 * - `derived`:    Computed from other evidence (e.g., prerequisite chain inference).
 * - `estimated`:  Statistical estimate from a model (IRT, Bayesian, regression).
 * - `predicted`:  Forecast of future state (spaced-repetition projection, trend extrapolation).
 */
export type EvidenceKind = 'unknown' | 'observed' | 'derived' | 'estimated' | 'predicted';

/**
 * Heuristic default priority for sorting/selection.
 *
 * **WARNING**: This is a deterministic heuristic, NOT a universal
 * quality ranking. A well-calibrated `predicted` value (confidence 0.95,
 * sampleSize 10000) may be more reliable than a noisy `observed` value
 * (sampleSize 3, no confidence). Use explicit selection policies in
 * production — never treat this priority as truth.
 *
 * Higher number = higher heuristic default priority.
 */
export const EVIDENCE_KIND_DEFAULT_PRIORITY: Record<EvidenceKind, number> = {
  observed: 5,
  derived: 4,
  estimated: 3,
  predicted: 2,
  unknown: 0,
};

/** All evidence kinds in an array (useful for iteration / validation) */
export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'unknown',
  'observed',
  'derived',
  'estimated',
  'predicted',
] as const;

// ============================================
// EvidenceProvenance — where evidence comes from
// ============================================

export interface EvidenceProvenance {
  /** Identifier for the originating system or process.
   *  Examples: 'student-practice', 'teacher-assessment', 'peer-review',
   *  'prerequisite-chain', 'bayesian-inference', 'irt-calibration',
   *  'spaced-repetition-projection'. */
  source: string;

  /** The method used to produce the evidence.
   *  Examples: 'direct-measurement', 'weighted-aggregation',
   *  'bayesian-update', 'irt-3pl', 'linear-regression',
   *  'exponential-decay-forecast'. */
  method?: string;

  /** Version of the model or algorithm that produced the evidence.
   *  Only meaningful for derived/estimated/predicted kinds. */
  modelVersion?: string;

  /** Human-readable explanation of how the evidence was produced. */
  description?: string;
}

// ============================================
// EvidenceConfidence — optional certainty metadata
// ============================================

export interface EvidenceConfidence {
  /** Confidence value 0–1 (1 = absolute certainty) */
  value: number;

  /** Optional confidence interval with named bounds */
  interval?: {
    lower: number;
    upper: number;
  };

  /** Number of data points this confidence is based on */
  sampleSize?: number;

  /** Method used to compute confidence (e.g., 'bootstrapped', 'analytical', 'heuristic') */
  method?: string;
}

// ============================================
// LearningEvidence — the domain contract
// ============================================

export interface LearningEvidence {
  /** Unique identifier for this evidence record */
  id: string;

  /** The skill this evidence pertains to */
  skillId: string;

  /** The student this evidence pertains to */
  studentId: string;

  /**
   * Epistemic classification — how we know this value.
   * Classification only; NOT a quality ranking.
   * Use `confidence` + `sampleSize` for reliability assessment.
   */
  kind: EvidenceKind;

  /**
   * The measured/computed/predicted skill value.
   *
   * INVARIANT: MUST be `null` when `kind === 'unknown'`.
   * No numeric fallback is permitted — unknown means unknown.
   *
   * For `observed`/`derived`/`estimated`/`predicted`, this is
   * typically a number in [0, 100] representing a mastery score.
   * This is a NUMERIC mastery evidence contract — do NOT store
   * categorical, textual, or boolean values here.
   */
  value: number | null;

  /** Where this evidence came from and how it was produced */
  provenance: EvidenceProvenance;

  /** Optional confidence metadata */
  confidence?: EvidenceConfidence;

  /**
   * When this evidence record was created.
   * ISO 8601 string.
   *
   * Semantics by kind:
   * - `observed`:  when the observation was recorded
   * - `derived`:   when the derivation was computed
   * - `estimated`: when the estimation was performed
   * - `predicted`: when the prediction was generated
   * - `unknown`:   when the absence of evidence was noted
   */
  createdAt: string;

  /**
   * Prediction horizon in days (predicted kind only).
   * Number of days from `createdAt` that this prediction forecasts.
   * Example: createdAt=2026-08-12, forecastHorizonDays=14 →
   *   this predicts the student's mastery on 2026-08-26.
   */
  forecastHorizonDays?: number;

  /**
   * Optional link to the assessment that generated this evidence.
   * For observed evidence, this is the assessment session ID.
   * For derived/estimated/predicted, this may be the originating
   * assessment or computation batch ID.
   */
  assessmentId?: string;

  /** Arbitrary extension metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Type guards
// ============================================

/** Evidence is completely absent — no value can be assigned. */
export function isUnknown(e: LearningEvidence): e is LearningEvidence & { kind: 'unknown'; value: null } {
  return e.kind === 'unknown';
}

/** Evidence comes from direct measurement. */
export function isObserved(e: LearningEvidence): e is LearningEvidence & { kind: 'observed' } {
  return e.kind === 'observed';
}

/** Evidence is computed from other evidence. */
export function isDerived(e: LearningEvidence): e is LearningEvidence & { kind: 'derived' } {
  return e.kind === 'derived';
}

/** Evidence is a statistical estimate from a model. */
export function isEstimated(e: LearningEvidence): e is LearningEvidence & { kind: 'estimated' } {
  return e.kind === 'estimated';
}

/** Evidence is a forecast of future state. */
export function isPredicted(e: LearningEvidence): e is LearningEvidence & { kind: 'predicted' } {
  return e.kind === 'predicted';
}

/** Evidence has a usable numeric value (not unknown). */
export function hasValue(e: LearningEvidence): e is LearningEvidence & { value: number } {
  return e.kind !== 'unknown' && e.value !== null;
}

// ============================================
// Builder functions
// ============================================

let _evidenceCounter = 0;
function nextId(prefix: string): string {
  _evidenceCounter += 1;
  return `${prefix}-${Date.now()}-${_evidenceCounter}`;
}

/** Reset the internal ID counter (for deterministic testing). */
export function resetEvidenceIdCounter(): void {
  _evidenceCounter = 0;
}

interface BaseEvidenceParams {
  skillId: string;
  studentId: string;
  provenance: EvidenceProvenance;
  confidence?: EvidenceConfidence;
  createdAt?: string;
  assessmentId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an `unknown` evidence record.
 * Value is ALWAYS null — no fallback permitted.
 */
export function createUnknownEvidence(params: BaseEvidenceParams): LearningEvidence {
  return {
    id: nextId('ev-unk'),
    skillId: params.skillId,
    studentId: params.studentId,
    kind: 'unknown',
    value: null,
    provenance: params.provenance,
    confidence: params.confidence,
    createdAt: params.createdAt ?? new Date().toISOString(),
    assessmentId: params.assessmentId,
    metadata: params.metadata,
  };
}

interface ValuedEvidenceParams extends BaseEvidenceParams {
  value: number;
}

/** Create an `observed` evidence record with a numeric value. */
export function createObservedEvidence(params: ValuedEvidenceParams): LearningEvidence {
  return {
    id: nextId('ev-obs'),
    skillId: params.skillId,
    studentId: params.studentId,
    kind: 'observed',
    value: params.value,
    provenance: params.provenance,
    confidence: params.confidence,
    createdAt: params.createdAt ?? new Date().toISOString(),
    assessmentId: params.assessmentId,
    metadata: params.metadata,
  };
}

/** Create a `derived` evidence record with a numeric value. */
export function createDerivedEvidence(params: ValuedEvidenceParams): LearningEvidence {
  return {
    id: nextId('ev-der'),
    skillId: params.skillId,
    studentId: params.studentId,
    kind: 'derived',
    value: params.value,
    provenance: params.provenance,
    confidence: params.confidence,
    createdAt: params.createdAt ?? new Date().toISOString(),
    assessmentId: params.assessmentId,
    metadata: params.metadata,
  };
}

/** Create an `estimated` evidence record with a numeric value. */
export function createEstimatedEvidence(params: ValuedEvidenceParams): LearningEvidence {
  return {
    id: nextId('ev-est'),
    skillId: params.skillId,
    studentId: params.studentId,
    kind: 'estimated',
    value: params.value,
    provenance: params.provenance,
    confidence: params.confidence,
    createdAt: params.createdAt ?? new Date().toISOString(),
    assessmentId: params.assessmentId,
    metadata: params.metadata,
  };
}

/**
 * Create a `predicted` evidence record with a numeric value.
 *
 * Optionally accepts `forecastHorizonDays` for prediction-specific
 * time semantics. When set, `createdAt` + `forecastHorizonDays`
 * defines the date this prediction forecasts to.
 */
export function createPredictedEvidence(
  params: ValuedEvidenceParams & { forecastHorizonDays?: number },
): LearningEvidence {
  return {
    id: nextId('ev-pred'),
    skillId: params.skillId,
    studentId: params.studentId,
    kind: 'predicted',
    value: params.value,
    provenance: params.provenance,
    confidence: params.confidence,
    createdAt: params.createdAt ?? new Date().toISOString(),
    forecastHorizonDays: params.forecastHorizonDays,
    assessmentId: params.assessmentId,
    metadata: params.metadata,
  };
}

// ============================================
// Validation
// ============================================

export interface EvidenceValidationError {
  field: string;
  message: string;
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: EvidenceValidationError[];
}

/**
 * Validate a LearningEvidence record against the contract invariants.
 *
 * Checks:
 * - `unknown` kind MUST have null value
 * - Non-unknown kinds SHOULD have a numeric value
 * - Required fields must be present
 * - Confidence.value must be in [0, 1] if present
 * - Confidence.interval bounds must be valid if present
 * - createdAt must be a valid ISO 8601 date string
 */
export function validateLearningEvidence(e: LearningEvidence): EvidenceValidationResult {
  const errors: EvidenceValidationError[] = [];

  // Required string fields
  if (!e.id || typeof e.id !== 'string') {
    errors.push({ field: 'id', message: 'id is required and must be a non-empty string' });
  }
  if (!e.skillId || typeof e.skillId !== 'string') {
    errors.push({ field: 'skillId', message: 'skillId is required and must be a non-empty string' });
  }
  if (!e.studentId || typeof e.studentId !== 'string') {
    errors.push({ field: 'studentId', message: 'studentId is required and must be a non-empty string' });
  }

  // kind must be a valid EvidenceKind
  if (!EVIDENCE_KINDS.includes(e.kind)) {
    errors.push({ field: 'kind', message: `kind must be one of: ${EVIDENCE_KINDS.join(', ')}` });
  }

  // Invariant: unknown MUST have null value
  if (e.kind === 'unknown' && e.value !== null) {
    errors.push({ field: 'value', message: 'unknown evidence must have null value (no numeric fallback permitted)' });
  }

  // Non-unknown SHOULD have a numeric value (soft check — warn but don't reject)
  if (e.kind !== 'unknown' && (e.value === null || typeof e.value !== 'number')) {
    errors.push({ field: 'value', message: `${e.kind} evidence should have a numeric value` });
  }

  // Value range check (if numeric)
  if (typeof e.value === 'number' && (e.value < 0 || e.value > 100)) {
    errors.push({ field: 'value', message: 'value should be in [0, 100] range for mastery scores' });
  }

  // Provenance must have at least a source
  if (!e.provenance || typeof e.provenance.source !== 'string' || !e.provenance.source) {
    errors.push({ field: 'provenance.source', message: 'provenance.source is required and must be a non-empty string' });
  }

  // Confidence validation
  if (e.confidence) {
    if (typeof e.confidence.value !== 'number' || e.confidence.value < 0 || e.confidence.value > 1) {
      errors.push({ field: 'confidence.value', message: 'confidence.value must be a number in [0, 1]' });
    }
    if (e.confidence.interval) {
      const { lower, upper } = e.confidence.interval;
      if (lower > upper) {
        errors.push({ field: 'confidence.interval', message: 'confidence interval lower bound must be ≤ upper bound' });
      }
      if (lower < 0 || upper > 1) {
        errors.push({ field: 'confidence.interval', message: 'confidence interval must be within [0, 1]' });
      }
    }
  }

  // createdAt must be parseable as ISO 8601
  if (!e.createdAt || typeof e.createdAt !== 'string') {
    errors.push({ field: 'createdAt', message: 'createdAt is required and must be an ISO 8601 string' });
  } else {
    const parsed = Date.parse(e.createdAt);
    if (isNaN(parsed)) {
      errors.push({ field: 'createdAt', message: 'createdAt must be a valid ISO 8601 date string' });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================
// Utility: heuristic default priority comparison
// ============================================

/**
 * Compare two evidence records by heuristic default priority.
 *
 * **HEURISTIC ONLY.** This uses `EVIDENCE_KIND_DEFAULT_PRIORITY`
 * (observed > derived > estimated > predicted > unknown) which is
 * a deterministic default, NOT a universal truth.
 *
 * Returns negative if `a` has lower default priority than `b`,
 * positive if higher, 0 if equal.
 *
 * **Production guidance**: prefer explicit selection policies that
 * consider confidence, sampleSize, and domain context. Do NOT use
 * this as an automatic "better evidence" comparator.
 */
export function compareEvidenceDefaultPriority(a: LearningEvidence, b: LearningEvidence): number {
  return EVIDENCE_KIND_DEFAULT_PRIORITY[a.kind] - EVIDENCE_KIND_DEFAULT_PRIORITY[b.kind];
}

/**
 * Pick the evidence with the highest heuristic default priority.
 *
 * **HEURISTIC ONLY — NOT A TRUTH SELECTOR.**
 *
 * This function uses `EVIDENCE_KIND_DEFAULT_PRIORITY` as a
 * deterministic tie-breaker. It does NOT consider confidence,
 * sampleSize, recency, or domain context beyond the default
 * priority ordering and a confidence tie-break within the same kind.
 *
 * Example where this heuristic is WRONG:
 * ```
 *   observed:  value=100, sampleSize=3,  confidence=undefined
 *   derived:   value=76,  sampleSize=200, confidence=0.95
 * ```
 * `pickHighestPriorityEvidence` returns `observed` (kind priority).
 * A domain-aware selection policy would likely prefer `derived`.
 *
 * Use this ONLY for quick inspection/sorting. Production selection
 * policies should be explicit, domain-aware, and consider multiple
 * dimensions (confidence, sampleSize, recency, provenance).
 *
 * Returns undefined if the array is empty.
 */
export function pickHighestPriorityEvidence(records: LearningEvidence[]): LearningEvidence | undefined {
  if (records.length === 0) return undefined;
  return records.reduce((best, curr) => {
    const cmp = compareEvidenceDefaultPriority(curr, best);
    if (cmp > 0) return curr;
    if (cmp < 0) return best;
    // Same kind — compare confidence
    const currConf = curr.confidence?.value ?? 0;
    const bestConf = best.confidence?.value ?? 0;
    return currConf > bestConf ? curr : best;
  });
}
