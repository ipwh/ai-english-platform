// ============================================
// 2026-10-03 PHASE IELTS-01: IELTS Assessment Response Schemas
// ============================================
// Deliberately tolerant at parse level (structural), strict at the service
// layer (semantic): band validity, evidence-quote verification and requirement
// coverage checks happen in the IELTS module so failures map to typed failure
// codes (AI_UNSUPPORTED_BAND / AI_MISSING_CRITERION / AI_EVIDENCE_MISMATCH)
// instead of being flattened into a generic parse error.
// ============================================

import { z } from 'zod';

export const IeltsCriterionEvidenceSchema = z.object({
  quote: z.string().default(''),
  explanation: z.string().default(''),
});

export const IeltsCriterionAssessmentSchema = z.object({
  band: z.coerce.number(),
  evidence: z.array(IeltsCriterionEvidenceSchema).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  rationale: z.string().default(''),
  confidence: z.coerce.number().min(0).max(1).default(0.5),
});

export const IeltsTaskCoverageStatusSchema = z.enum([
  'ADDRESSED',
  'PARTIALLY_ADDRESSED',
  'NOT_ADDRESSED',
]);

export const IeltsTaskCoverageItemSchema = z.object({
  requirementId: z.string(),
  status: IeltsTaskCoverageStatusSchema,
  evidence: z.array(IeltsCriterionEvidenceSchema).default([]),
});

export const IeltsWritingAssessmentSchema = z.object({
  // Criterion fields are OPTIONAL at parse level: a missing criterion must map
  // to the typed failure AI_MISSING_CRITERION (not a generic parse error), and
  // the service layer decides. Never trust a model-reported aggregate band.
  taskAchievementOrResponse: IeltsCriterionAssessmentSchema.optional(),
  coherenceAndCohesion: IeltsCriterionAssessmentSchema.optional(),
  lexicalResource: IeltsCriterionAssessmentSchema.optional(),
  grammaticalRangeAndAccuracy: IeltsCriterionAssessmentSchema.optional(),
  taskCoverage: z.array(IeltsTaskCoverageItemSchema).default([]),
  positionPresent: z.boolean().optional(),
  templateSuspicion: z
    .object({
      suspected: z.boolean().default(false),
      rationale: z.string().default(''),
    })
    .optional(),
  uncertainty: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

export type IeltsWritingAssessmentResponse = z.infer<typeof IeltsWritingAssessmentSchema>;

// ============================================
// Speaking PREPARATION coach (2026-10-03 II)
// ============================================
// The platform does NOT score Speaking and does NOT simulate an examiner.
// The coach returns preparation material only — there is deliberately NO band,
// score, pronunciation or examiner field in this schema (unknown keys are
// stripped by Zod, so a hostile model cannot smuggle one through).

export const IeltsSpeakingPrepLanguageItemSchema = z.object({
  item: z.string(),
  example: z.string().default(''),
  usage: z.string().default(''),
});

export const IeltsSpeakingPrepSchema = z.object({
  plan: z
    .object({
      focus: z.string().default(''),
      steps: z.array(z.string()).default([]),
    })
    .optional(),
  outline: z
    .array(
      z.object({
        facet: z.string(),
        ideas: z.array(z.string()).default([]),
      }),
    )
    .optional(),
  usefulLanguage: z.array(IeltsSpeakingPrepLanguageItemSchema).default([]),
  pitfalls: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
  mergeSuggestions: z
    .array(
      z.object({
        theme: z.string(),
        suggestion: z.string(),
      }),
    )
    .default([]),
});

export type IeltsSpeakingPrepResponse = z.infer<typeof IeltsSpeakingPrepSchema>;

// ============================================
// Mistake explanation (2026-10-03 VI) — advisory only, never changes a mark
// ============================================

export const IeltsMistakeExplanationSchema = z.object({
  /** Why the canonical answer is correct — must cite the passage/transcript. */
  explanation: z.string().default(''),
  /** Why the student's specific wrong answer is tempting and where it fails. */
  misconception: z.string().default(''),
  /** One actionable self-check for next time. */
  tip: z.string().default(''),
});

export type IeltsMistakeExplanationResponse = z.infer<typeof IeltsMistakeExplanationSchema>;
