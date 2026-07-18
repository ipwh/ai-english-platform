// Sprint 6: AI Request schemas — validate AI route request bodies
import { z } from 'zod';
import { difficulty, gradeLevel, studentId, userId, optionalString } from './common.schema';

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
  userId,
});

export const analyzeWritingSchema = z.object({
  title: z.string().min(1, '作文標題為必填'),
  studentDraft: z.string().min(1, '作文內容為必填'),
  prompt: optionalString,
  textType: optionalString,
  studentLevel: optionalString,
  userId,
});

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
  userId,
});

export const explainMistakeSchema = z.object({
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
  studentAnswer: z.string().min(1),
  grammarItemZh: optionalString,
  studentLevel: optionalString,
  userId,
});

export const generateIntegratedSkillsSchema = z.object({
  gradeLevel,
  difficulty,
  taskType: z.enum(['summary', 'email-reply', 'short-article', 'report']),
  topicHint: optionalString,
  userId,
});

export const analyzeIntegratedSkillsSchema = z.object({
  listeningContent: z.string().min(1),
  writingTask: z.string().min(1),
  studentWriting: z.string().min(1),
  studentNotes: optionalString,
  expectedContentPoints: z.array(z.string()),
  noteTakingGuide: z.array(z.object({ question: z.string(), hint: z.string() })),
  userId,
});

export const generateWritingSchema = z.object({
  textType: z.string().min(1, '文本類型為必填'),
  gradeLevel,
  wordLimit: z.number().int().min(50).max(1000),
  topicHint: optionalString,
  lang: z.enum(['zh', 'en']).optional(),
  userId,
});

export const analyzeWordSchema = z.object({
  word: z.string().min(1, '單字為必填'),
  gradeLevel: gradeLevel.optional(),
  userId,
});

export const studyHelpSchema = z.object({
  question: z.string().min(1, '問題為必填'),
  studentLevel: z.string().min(1),
  userId,
});
