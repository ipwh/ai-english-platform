// ============================================
// Rubric Versioning — formal metadata for calibration
// Phase 5: Explicit rubric identity for future human-marker calibration.
//
// IMPORTANT:
//   These are PLATFORM version identifiers, NOT official HKEAA numbers.
//   The rubric version does NOT control scoring logic — it is metadata only.
// ============================================

/** Single source of truth for the current writing rubric version. */
export const WRITING_RUBRIC_VERSION = "HKDSE-P2-CLO-v1" as const;

/** Metadata describing the rubric used for a writing analysis. */
export interface WritingRubricMetadata {
  /** Platform rubric version identifier (NOT an official HKEAA number). */
  rubricVersion: typeof WRITING_RUBRIC_VERSION;

  /** HKDSE exam year if known (e.g. "2024"). Undefined if not applicable. */
  examYear?: string;

  /** HKDSE paper — always "Paper 2" for writing analysis. */
  paper: "Paper 2";

  /** Task text type if provided (e.g. "article", "letter", "speech"). */
  taskType?: string;
}

/** Metadata reserved for future human-marker calibration.
 *  Do NOT store prompts, raw LLM responses, or provider secrets here. */
export interface CalibrationMetadata {
  /** Rubric version used for this analysis. */
  rubricVersion: string;

  /** AI model used (if safely available from the provider layer). */
  model?: string;

  /** Internal evaluator version identifier. */
  evaluatorVersion?: string;

  /** ISO timestamp of generation. */
  generatedAt?: string;
}

/** Factory: create rubric metadata for the current analysis. */
export function createRubricMetadata(taskType?: string): WritingRubricMetadata {
  return {
    rubricVersion: WRITING_RUBRIC_VERSION,
    paper: "Paper 2",
    taskType,
  };
}
