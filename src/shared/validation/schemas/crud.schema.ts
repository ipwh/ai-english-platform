// Sprint 6: CRUD schemas — assignments, vocabulary, practice, etc.
import { z } from 'zod';
import { studentId, difficulty, gradeLevel, optionalString, optionalNumber } from './common.schema';

export const assignmentCreateSchema = z.object({
  title: z.string().min(1, '標題為必填'),
  createdBy: z.string().min(1, 'createdBy 為必填'),
  description: optionalString,
  className: optionalString,
  classId: optionalString,
  // 2026-08-30 audit (R7): 白名單枚舉 — 任意 targetType 原可繞過班級/組別/學生
  // 成員檢查，產生無人可見的孤兒作業。
  targetType: z.enum(['class', 'group', 'students']).optional(),
  gradeLevel: gradeLevel.optional(),
  strand: optionalString,
  grammarItem: optionalString,
  languageSkill: optionalString,
  difficulty: difficulty.optional(),
  questionCount: optionalNumber,
  timeLimit: optionalNumber,
  dueDate: z.string().optional(),
  questions: z.array(z.any()).optional(),
  groupIds: z.array(z.string()).optional(),
  studentIds: z.array(z.string()).optional(),
  classIds: z.array(z.string()).optional(),
});

export const practiceCreateSchema = z.object({
  studentId,
  skill: optionalString,
  skillZh: optionalString,
  difficulty: difficulty.optional(),
  totalQuestions: optionalNumber,
  correctCount: optionalNumber,
  source: optionalString,
  answers: z.array(z.any()).optional(),
});

export const vocabularyCreateSchema = z.object({
  studentId,
  word: z.string().min(1, '單字為必填'),
  translation: z.string().min(1, '翻譯為必填'),
  partOfSpeech: optionalString,
  example: optionalString,
  source: optionalString,
});

export const vocabularySuggestSchema = z.object({
  studentId,
  text: z.string().min(1, '文本為必填'),
});

export const mistakeCreateSchema = z.object({
  studentId,
  questionId: z.string().min(1),
  question: optionalString,
  correctAnswer: optionalString,
  studentAnswer: optionalString,
  grammarItem: optionalString,
});

export const mistakeBulkSchema = z.object({
  studentId,
  action: z.enum(['delete-all', 'delete-selected']),
  ids: z.array(z.string()).optional(),
});

export const feedbackSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export const writingDraftSchema = z.object({
  title: z.string().min(1, '標題為必填'),
  content: z.string().optional(),
  studentId,
  textType: optionalString,
  prompt: optionalString,
  draft: z.string().optional(),
  aiSuggestions: z.string().optional(),
  chinglishWarnings: z.string().optional(),
});

export const notificationCreateSchema = z.object({
  type: z.enum(['assignment', 'feedback', 'reminder', 'system', 'achievement']),
  title: z.string().min(1),
  message: z.string().min(1),
  link: optionalString,
  userId: z.string().min(1),
});

export const ttsRequestSchema = z.object({
  text: z.string().min(1, '文字內容為必填').max(5000),
  lang: z.enum(['en', 'zh']).default('en'),
  speed: z.number().min(0.5).max(2).default(1),
  voiceName: z.string().optional(),
  voiceTier: z.enum(['default', 'wavenet', 'neural']).default('default'),
  speakingRate: z.number().min(0.25).max(4.0).default(1.0),
  multiSpeaker: z.boolean().default(false),
  audioEncoding: z.enum(['MP3', 'OGG_OPUS', 'LINEAR16']).default('MP3'),
});

export const diagnosticCreateSchema = z.object({
  studentId,
  results: z.array(z.object({
    grammarItem: z.string(),
    score: z.number(),
    level: z.string(),
  })).min(1),
});
