// ============================================
// Writing Artifact Identity — generation metadata contract
// ============================================
// Distinguishes PEDAGOGICAL TARGET from ASSESSMENT RESULT.
//
//   Pedagogical target  = "what learning level this model essay was designed
//                          to illustrate" — GENERATION metadata.
//   Assessment result   = "what the canonical scorer independently computes
//                          from the actual text" — ASSESSMENT metadata.
//
// INVARIANTS (enforced by tests):
//   - pedagogicalTargetLevel NEVER participates in canonical scoring
//     (C/L/O, cloTotal, overallScore, dseLevel are all computed from the
//     essay text alone).
//   - assessment results NEVER overwrite pedagogicalTargetLevel.
//   - generation target mapping is deterministic and server-determined
//     (LLM output can never set the target).
//   - unknown historical artifacts are NEVER guessed: absence of metadata
//     means source is unknown, not "generated_model".
// ============================================

import { z } from "zod";

/** How the writing text came to exist. */
export type WritingArtifactSource =
  | "student_submission"
  | "generated_model"
  | "teacher_example"
  | "imported_example";

export const WritingArtifactSourceSchema = z.enum([
  "student_submission",
  "generated_model",
  "teacher_example",
  "imported_example",
]);

/** Generation target granularity used by the product's model-essay feature. */
export type GenerationTarget = "low" | "mid" | "high";

export const GenerationTargetSchema = z.enum(["low", "mid", "high"]);

/** Generation contract version — bump when generation prompt/mapping changes. */
export const MODEL_ESSAY_GENERATION_VERSION = "MODEL_ESSAY_GENERATION_V1" as const;

/**
 * PLATFORM_DEFINED mapping from a generation target to a pedagogical level.
 * This is NOT an official HKEAA conversion and must never be presented as one.
 * Server-side only — the LLM never decides this value.
 *
 * Repository product contract: mid → 3 (Level 3-targeted model),
 * high → 5 (Level 5-targeted model). low → 2 is defined for completeness
 * of the mapping ladder (documented PLATFORM_DEFINED; not yet exposed by
 * any generation endpoint).
 */
export function generationTargetToPedagogicalLevel(
  target: GenerationTarget,
): "1" | "2" | "3" | "4" | "5" {
  switch (target) {
    case "low":
      return "2";
    case "mid":
      return "3";
    case "high":
      return "5";
  }
}

export interface WritingArtifactMetadata {
  /** Where the writing came from. */
  source: WritingArtifactSource;
  /**
   * PEDAGOGICAL TARGET ONLY — the level this artifact was designed to
   * illustrate. NEVER participates in canonical scoring.
   */
  pedagogicalTargetLevel?: "1" | "2" | "3" | "4" | "5";
  /** Human-readable generation target (e.g. "mid"). Never a scoring authority. */
  generationTarget?: GenerationTarget;
  /** Version of the generation contract/prompt that produced the artifact. */
  generationVersion?: string;
  /** Quality-gate outcome for generated models ("verified" | "unverified"). */
  qualityStatus?: "verified" | "unverified";
}

export const WritingArtifactMetadataSchema = z.object({
  source: WritingArtifactSourceSchema,
  pedagogicalTargetLevel: z.enum(["1", "2", "3", "4", "5"]).optional(),
  generationTarget: GenerationTargetSchema.optional(),
  generationVersion: z.string().optional(),
  qualityStatus: z.enum(["verified", "unverified"]).optional(),
});

/**
 * Build server-authoritative metadata for a generated model essay.
 * The target mapping is deterministic; caller-supplied (client) metadata is
 * NEVER used to build this object.
 */
export function buildGeneratedModelMetadata(input: {
  generationTarget: GenerationTarget;
  qualityStatus?: "verified" | "unverified";
}): WritingArtifactMetadata {
  return {
    source: "generated_model",
    generationTarget: input.generationTarget,
    pedagogicalTargetLevel: generationTargetToPedagogicalLevel(input.generationTarget),
    generationVersion: MODEL_ESSAY_GENERATION_VERSION,
    qualityStatus: input.qualityStatus ?? "verified",
  };
}
