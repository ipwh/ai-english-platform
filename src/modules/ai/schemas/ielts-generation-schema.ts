// ============================================
// 2026-10-03 PHASE IELTS-01 (IV): AI Generation Response Schemas
// ============================================
// Schemas for AI-authored practice content. Parsing is intentionally tolerant
// (missing arrays default to []); semantic validity is decided by the IELTS
// module (machine screen + blind-solve verification), never here.
//
// GOVERNANCE: generated content can only ever reach QA_REQUIRED. It can never
// be published by the AI path — a human reviewer must approve, and only then
// can the test be published.
// ============================================

import { z } from 'zod';

export const IeltsGeneratedOptionSchema = z.object({
  code: z.string().min(1),
  text: z.string().min(1),
});

export const IeltsGeneratedWordLimitSchema = z.object({
  maxWords: z.number().int().positive().optional(),
  allowsNumber: z.boolean().optional(),
  instruction: z.string().optional(),
});

export const IeltsGeneratedQuestionSchema = z.object({
  questionType: z.string(),
  prompt: z.string().min(1),
  options: z
    .union([z.array(z.string()), z.array(IeltsGeneratedOptionSchema)])
    .nullish(),
  /** Single key only (multi-answer items are rejected — official numbering rule). */
  answerKey: z.union([z.string(), z.array(z.string())]),
  acceptedAnswers: z.array(z.string()).default([]),
  wordLimit: IeltsGeneratedWordLimitSchema.nullish(),
  /** Reading: EXACT substrings of the passage (verbatim). */
  evidenceQuotes: z.array(z.string()).default([]),
  evidenceReasoning: z.string().default(''),
  /** Listening: the text (or completion answer) the transcript supports. */
  expectedAnswer: z.string().optional(),
  /** Listening: exact transcript quote supporting the answer. */
  transcriptQuote: z.string().optional(),
  explanation: z.string().default(''),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
});

export const IeltsGeneratedSetSchema = z.object({
  title: z.string().default(''),
  /** Reading set: the passage. Listening set: null. */
  passage: z.string().nullish(),
  /** Listening set: the transcript. Reading set: null. */
  transcript: z.string().nullish(),
  questions: z.array(IeltsGeneratedQuestionSchema).default([]),
});

export type IeltsGeneratedQuestion = z.infer<typeof IeltsGeneratedQuestionSchema>;
export type IeltsGeneratedSet = z.infer<typeof IeltsGeneratedSetSchema>;

/**
 * Section EXTENSION output — questions ONLY (2026-10-08).
 *
 * A section's passage/transcript is fixed once it has been accepted: every item
 * attached to it must be supported by THAT text. Topping a section up therefore
 * cannot re-run the set generator (which always authors a new text); it asks for
 * more questions against the existing text and deliberately does NOT accept a
 * passage/transcript back — asking the model to echo a 700-word passage would
 * cost tokens and invite silent drift between the text and its items.
 */
export const IeltsGeneratedItemsSchema = z.object({
  questions: z.array(IeltsGeneratedQuestionSchema).default([]),
});

export type IeltsGeneratedItems = z.infer<typeof IeltsGeneratedItemsSchema>;

// ============================================
// Blind-solve verification (objective items)
// ============================================

export const IeltsItemVerificationEntrySchema = z.object({
  questionId: z.string(),
  answer: z.string().default(''),
  soundness: z.enum(['ok', 'ambiguous', 'flawed']).default('ok'),
  note: z.string().default(''),
});

export const IeltsItemVerificationSchema = z.object({
  items: z.array(IeltsItemVerificationEntrySchema).default([]),
});

export type IeltsItemVerificationResponse = z.infer<typeof IeltsItemVerificationSchema>;

// ============================================
// Writing task-prompt generation + conformance check
// ============================================

export const IeltsWritingPromptGenerationSchema = z.object({
  /** Short original title (English). */
  title: z.string().default(''),
  /** Full official-style task text (instructions + minimum + task). */
  promptText: z.string().min(1),
});

export type IeltsWritingPromptGeneration = z.infer<typeof IeltsWritingPromptGenerationSchema>;

export const IeltsWritingPromptVerificationSchema = z.object({
  /** True only when every required element for the task type is present. */
  conforms: z.boolean().default(false),
  issues: z.array(z.string()).default([]),
});

export type IeltsWritingPromptVerification = z.infer<typeof IeltsWritingPromptVerificationSchema>;
