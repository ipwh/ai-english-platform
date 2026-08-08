// ============================================
// Assessment Feedback Types — evidence-backed contract
// Phase 3: Structured, evidence-grounded feedback items.
//
// Every feedback item must include:
//   claim → what is being asserted
//   evidence → actual student text supporting the claim
//   recommendation → actionable guidance (optional)
//
// These are internal types. The public WritingAnalysis
// exposes `feedback?: EvidenceBackedFeedback[]`.
// ============================================

export type FeedbackDimension =
  | "content"
  | "language"
  | "organization"
  | "task_coverage"
  | "vocabulary"
  | "grammar";

export type FeedbackKind = "strength" | "weakness" | "recommendation";

export interface EvidenceBackedFeedback {
  /** Unique identifier for this feedback item. */
  id: string;

  /** Which assessment dimension this feedback addresses. */
  dimension: FeedbackDimension;

  /** Priority: essential (must fix), important (should fix), optional (nice-to-have). */
  priority?: "essential" | "important" | "optional";

  /** Whether this is a strength, weakness, or standalone recommendation. */
  kind: FeedbackKind;

  /** The evaluator's claim about the student's writing. */
  claim: string;

  /**
   * Actual evidence from the student's essay supporting the claim.
   * MUST be traceable to the submitted text.
   * MUST be empty ([]) rather than fabricated if no evidence exists.
   */
  evidence: string[];

  /**
   * Actionable guidance for the student.
   * Optional — may be omitted for simple strengths.
   */
  recommendation?: string;

  /**
   * Concrete action the student can take (e.g. "Review subject-verb agreement").
   */
  action?: string;

  /**
   * An example correction or improvement, preserving the student's original meaning.
   */
  example?: string;

  /**
   * Confidence level of the evaluator in this feedback item.
   * "high" — evidence is clear and directly supports the claim.
   * "medium" — evidence supports the claim but may be paraphrased.
   * "low" — claim is reasonable but evidence is weak or missing.
   */
  confidence?: "high" | "medium" | "low";
}
