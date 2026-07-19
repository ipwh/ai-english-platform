// Sprint 41+: API Route Schemas — 為尚未使用 Zod 的 routes 建立驗證
import { z } from 'zod';
import { difficulty, gradeLevel, studentLevel } from './common.schema';

// ============================================
// AI Routes
// ============================================

export const analyzeAnswerSchema = z.object({
  question: z.string().min(1, '題目為必填'),
  questionType: z.enum(['mc', 'fill-blank', 'matching', 'ordering', 'short-answer', 'writing']).default('mc'),
  correctAnswer: z.string().min(1, '正確答案為必填'),
  studentAnswer: z.string().min(1, '學生答案為必填'),
  choices: z.array(z.string()).optional(),
  listeningContent: z.string().optional(),
  readingContent: z.string().optional(),
  grammarItem: z.string().optional(),
  grammarItemZh: z.string().optional(),
  studentLevel: studentLevel,
});

export const analyzeWritingSchemaApi = z.object({
  title: z.string().min(1, '標題為必填'),
  prompt: z.string().min(1, '題目提示為必填'),
  studentDraft: z.string().min(1, '學生作文為必填'),
  studentLevel: studentLevel,
  textType: z.string().optional(),
});

export const explainMistakeSchema = z.object({
  question: z.string().min(1, '題目為必填'),
  correctAnswer: z.string().min(1, '正確答案為必填'),
  studentAnswer: z.string().min(1, '學生答案為必填'),
  grammarItemZh: z.string().optional(),
  studentLevel: studentLevel,
});

export const studyHelpSchema = z.object({
  question: z.string().min(1, '問題為必填'),
  studentLevel: studentLevel,
  weakSkills: z.array(z.string()).optional(),
  recentMistakes: z.array(z.string()).optional(),
  recentPerformance: z.string().optional(),
});

// ============================================
// Auth Routes
// ============================================

export const loginSchema = z.object({
  email: z.string().email('電郵格式不正確'),
  password: z.string().min(1, '密碼為必填'),
});

export const roleUpdateSchemaApi = z.object({
  role: z.enum(['student', 'teacher', 'admin'], { message: '角色必須為 student/teacher/admin' }),
});

// ============================================
// Assignment Routes
// ============================================

export const assignmentCreateSchemaApi = z.object({
  title: z.string().min(1, '標題為必填'),
  description: z.string().optional(),
  className: z.string().optional(),
  classId: z.string().optional(),
  targetType: z.enum(['class', 'group', 'students']).optional(),
  gradeLevel: gradeLevel.optional(),
  strand: z.string().optional(),
  grammarItem: z.string().optional(),
  languageSkill: z.string().optional(),
  difficulty: difficulty.optional(),
  questionCount: z.coerce.number().int().min(1).max(50).optional(),
  timeLimit: z.coerce.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  questions: z.array(z.object({
    questionType: z.enum(['mc', 'fill-blank', 'matching', 'ordering', 'short-answer']),
    prompt: z.string().min(1),
    options: z.string().optional(),
    answer: z.string().min(1),
    explanation: z.string().optional(),
    orderIndex: z.number().int().min(0).default(0),
  })).optional(),
  groupIds: z.array(z.string()).optional(),
  studentIds: z.array(z.string()).optional(),
  createdBy: z.string().min(1, 'createdBy 為必填'),
});

// ============================================
// Mistake Routes
// ============================================

export const mistakeCreateSchemaApi = z.object({
  studentId: z.string().min(1, 'studentId 為必填'),
  questionId: z.string().min(1, 'questionId 為必填'),
  studentAnswer: z.string().optional(),
  correctAnswer: z.string().optional(),
  mistakeType: z.enum(['grammar', 'vocabulary', 'comprehension', 'careless', 'time-management', 'chinglish']).optional(),
  aiExplanation: z.string().optional(),
});

export const mistakeUpdateSchemaApi = z.object({
  id: z.string().min(1),
  reviewed: z.boolean().optional(),
  inReviewList: z.boolean().optional(),
});

// ============================================
// Vocabulary Routes
// ============================================

export const vocabCreateSchemaApi = z.object({
  studentId: z.string().min(1, 'studentId 為必填'),
  word: z.string().min(1, '單字為必填'),
  partOfSpeech: z.string().optional(),
  allPartOfSpeech: z.string().optional(),
  meaningZh: z.string().min(1, '中文意思為必填'),
  secondaryMeaningZh: z.string().optional(),
  exampleSentence: z.string().optional(),
  exampleZh: z.string().optional(),
  synonyms: z.string().optional(),
  antonyms: z.string().optional(),
  collocations: z.string().optional(),
  familiarity: z.enum(['new', 'learning', 'familiar', 'mastered']).optional(),
  masteryLevel: z.coerce.number().int().min(0).max(5).optional(),
});

export const vocabUpdateSchemaApi = z.object({
  id: z.string().min(1),
  familiarity: z.enum(['new', 'learning', 'familiar', 'mastered']).optional(),
  masteryLevel: z.coerce.number().int().min(0).max(5).optional(),
  nextReviewDate: z.string().datetime().optional(),
  reviewInterval: z.coerce.number().int().optional(),
  easeFactor: z.coerce.number().min(1.0).max(5).optional(),
  lastReviewedAt: z.string().datetime().optional(),
});

// ============================================
// Feedback Route
// ============================================

export const feedbackCreateSchemaApi = z.object({
  type: z.string().min(1, '回饋類型為必填'),
  payload: z.record(z.string(), z.unknown()),
});

// ============================================
// Notification Route
// ============================================

export const notificationCreateSchemaApi = z.object({
  type: z.enum(['assignment', 'feedback', 'reminder', 'system', 'achievement']),
  title: z.string().min(1, '通知標題為必填'),
  message: z.string().min(1, '通知內容為必填'),
  link: z.string().optional(),
  userId: z.string().min(1, 'userId 為必填'),
});

// ============================================
// Group Routes
// ============================================

export const groupCreateSchemaApi = z.object({
  name: z.string().min(1, '組別名稱為必填').max(100),
  description: z.string().max(500).optional(),
  studentIds: z.array(z.string()).optional(),
});

export const groupUpdateSchemaApi = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});
