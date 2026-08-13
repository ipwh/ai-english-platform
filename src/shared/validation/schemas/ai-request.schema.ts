// Sprint 6: AI Request schemas — validate AI route request bodies
// Sprint 102: userId made optional — routes inject from auth, not request body
import { z } from 'zod';
import { difficulty, gradeLevel, optionalString } from './common.schema';
import { WritingArtifactMetadataSchema } from '@/modules/ai/core/writing-artifact';

export const generateQuestionsSchema = z.object({
  difficulty,
  gradeLevel,
  count: z.number().int().min(1).max(20).default(5),
  questionType: z.enum(['mc', 'fill-blank', 'error-correction', 'short-writing', 'matching']).optional(),
  grammarItem: optionalString,
  grammarItemZh: optionalString,
  languageSkill: z.enum(['reading', 'writing', 'listening', 'speaking', 'integrated']).optional(),
  languageSkillZh: optionalString,
  topic: optionalString,
  userId: optionalString,
});

export const analyzeWritingSchema = z.object({
  title: z.string().min(1, '作文標題為必填'),
  studentDraft: z.string().min(1, '作文內容為必填'),
  prompt: optionalString,
  textType: optionalString,
  studentLevel: optionalString,
  // UI compatibility: the client sends `gradeLevel`; the route maps it to
  // `studentLevel` at the request boundary (never silently stripped).
  gradeLevel: optionalString,
  // Accepted for UI compatibility; not consumed by the scoring pipeline.
  difficulty: optionalString,
  // Artifact identity metadata (e.g. generated_model). Context/traceability
  // ONLY — the canonical scorer NEVER reads it for C/L/O, overallScore, or
  // dseLevel. Client-supplied metadata can never alter scoring.
  artifact: WritingArtifactMetadataSchema.optional(),
  userId: optionalString,
});

/**
 * Resolve the internal student level at the request boundary.
 * Contract: `studentLevel` (canonical) takes precedence; the UI's
 * `gradeLevel` is mapped explicitly — fields are never silently stripped.
 */
export function resolveWritingStudentLevel(input: {
  studentLevel?: string;
  gradeLevel?: string;
}): string | undefined {
  return input.studentLevel ?? input.gradeLevel;
}

export const analyzeAnswerSchema = z.object({
  question: z.string().min(1, '題目為必填'),
  correctAnswer: z.string().min(1, '正確答案為必填'),
  studentAnswer: z.string().min(1, '學生答案為必填'),
  questionType: z.string(),
  choices: z.array(z.string()).optional(),
  listeningContent: optionalString,
  readingContent: optionalString,
  grammarItem: optionalString,
  grammarItemZh: optionalString,
  studentLevel: optionalString,
  userId: optionalString,
});

export const explainMistakeSchema = z.object({
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
  studentAnswer: z.string().min(1),
  grammarItemZh: optionalString,
  studentLevel: optionalString,
  userId: optionalString,
});

export const generateIntegratedSkillsSchema = z.object({
  gradeLevel,
  difficulty,
  taskType: z.enum(['summary', 'email-reply', 'short-article', 'report', 'speech', 'proposal', 'notice', 'press-release', 'letter-to-editor']),
  topicHint: optionalString,
  userId: optionalString,
});

export const analyzeIntegratedSkillsSchema = z.object({
  listeningContent: z.string().min(1),
  writingTask: z.string().min(1),
  studentWriting: z.string().min(1),
  studentNotes: optionalString,
  expectedContentPoints: z.array(z.string()),
  noteTakingGuide: z.array(z.object({ question: z.string(), hint: z.string() })),
  taskType: optionalString,
  gradeLevel: optionalString,
  dataFileSources: z.array(z.object({
    type: z.string(),
    title: z.string(),
    content: z.string(),
    relevantFor: z.array(z.number()),
    sourceDate: optionalString,
  })).optional(),
  userId: optionalString,
});

export const generateWritingSchema = z.object({
  action: z.enum(['prompt', 'outline']).optional(),
  textType: z.string().min(1, '文本類型為必填'),
  gradeLevel,
  wordLimit: z.number().int().min(50).max(1000),
  topicHint: optionalString,
  writingPrompt: z.string().optional(),
  lang: z.enum(['zh', 'en']).optional(),
  userId: optionalString,
});

export const analyzeWordSchema = z.object({
  word: z.string().min(1, '單字為必填'),
  gradeLevel: gradeLevel.optional(),
  userId: optionalString,
});

export const studyHelpSchema = z.object({
  question: z.string().min(1, '問題為必填'),
  studentLevel: z.string().min(1),
  userId: optionalString,
});
