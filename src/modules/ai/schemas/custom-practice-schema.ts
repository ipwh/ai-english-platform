// ============================================
// Self-Directed Practice — AI output schemas (2026-10-10, Sprint 140)
// ============================================
// Every AI response for this feature passes through one of these Zod schemas
// before it can reach a student or the database. Malformed output is a failure,
// never a silent partial success: the caller drops invalid items and reports the
// shortfall honestly (or returns a structured 422 when nothing survives).
// ============================================

import { z } from 'zod';

export const CUSTOM_PRACTICE_CATEGORIES = ['grammar', 'sentence_pattern', 'vocabulary'] as const;
export const CUSTOM_PRACTICE_DIFFICULTIES = ['basic', 'intermediate', 'advanced'] as const;
export const CUSTOM_PRACTICE_QUESTION_TYPES = [
  'mc',
  'fill_blank',
  'error_correction',
  'transformation',
  'sentence_production',
] as const;

export type CustomPracticeCategory = (typeof CUSTOM_PRACTICE_CATEGORIES)[number];
export type CustomPracticeDifficulty = (typeof CUSTOM_PRACTICE_DIFFICULTIES)[number];
export type CustomPracticeQuestionType = (typeof CUSTOM_PRACTICE_QUESTION_TYPES)[number];

export const CustomPracticeQuestionSchema = z.object({
  orderIndex: z.number().int().min(0).max(20),
  questionType: z.enum(CUSTOM_PRACTICE_QUESTION_TYPES),
  instructions: z.string().min(1).max(300),
  prompt: z.string().min(1).max(1200),
  answerKey: z.string().min(1).max(300),
  acceptedAnswers: z.array(z.string().min(1).max(300)).max(10).default([]),
  rejectedAnswers: z
    .array(z.object({ answer: z.string().min(1).max(300), why: z.string().min(1).max(300) }))
    .max(10)
    .default([]),
  rubric: z.object({
    marks: z.number().int().min(1).max(5),
    criteria: z.array(z.string().min(1).max(300)).min(1).max(6),
  }),
  targetRule: z.string().min(1).max(200),
  explanationZh: z.string().max(600).nullable().default(null),
  explanationEn: z.string().min(1).max(600),
  misconceptionTags: z.array(z.string().min(1).max(60)).max(6).default([]),
  maxMarks: z.number().int().min(1).max(5).default(1),
});

export const CustomPracticeGenerationSchema = z.object({
  questions: z.array(CustomPracticeQuestionSchema).min(1).max(12),
});

export const CustomPracticeGradingSchema = z.object({
  results: z
    .array(
      z.object({
        questionId: z.string().min(1).max(64),
        verdict: z.enum(['correct', 'partially_correct', 'incorrect']),
        awardedMarks: z.number().int().min(0).max(5),
        rationale: z.string().min(1).max(800),
        improvement: z.string().max(400).nullable().default(null),
        confidence: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(20),
});

export type CustomPracticeGeneratedQuestion = z.infer<typeof CustomPracticeQuestionSchema>;
export type CustomPracticeGenerationResponse = z.infer<typeof CustomPracticeGenerationSchema>;
export type CustomPracticeGradingResponse = z.infer<typeof CustomPracticeGradingSchema>;

/** Blind verification result — produced WITHOUT the proposed answer key. */
export const CustomPracticeVerificationSchema = z.object({
  results: z
    .array(
      z.object({
        index: z.number().int().min(0).max(20),
        answer: z.string().max(600).default(''),
        confidence: z.number().min(0).max(1),
        ambiguous: z.boolean().default(false),
        ambiguousReason: z.string().max(400).nullable().default(null),
        rubricSatisfiable: z.boolean().default(true),
        issue: z.string().max(400).nullable().default(null),
      })
    )
    .min(1)
    .max(20),
});

export type CustomPracticeVerificationResponse = z.infer<typeof CustomPracticeVerificationSchema>;
