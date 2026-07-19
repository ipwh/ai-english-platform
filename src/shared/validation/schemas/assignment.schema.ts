// Sprint 6+: Assignment API Schemas
import { z } from 'zod';

export const assignmentCreateSchemaV2 = z.object({
  title: z.string().min(1, '作業名稱為必填'),
  description: z.string().optional(),
  classId: z.string().optional(),
  targetType: z.enum(['class', 'group', 'students']).default('class'),
  gradeLevel: z.string().regex(/^S[1-6]$/),
  strand: z.string().min(1, '學習範疇為必填'),
  grammarItem: z.string().optional(),
  languageSkill: z.string().optional(),
  difficulty: z.enum(['remedial', 'core', 'challenge']).default('core'),
  questionCount: z.coerce.number().int().min(1).max(50).default(5),
  timeLimit: z.coerce.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  groupIds: z.array(z.string()).optional(),
  studentIds: z.array(z.string()).optional(),
});

export const assignmentUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  difficulty: z.enum(['remedial', 'core', 'challenge']).optional(),
  dueDate: z.string().datetime().optional(),
  questionCount: z.coerce.number().int().min(1).max(50).optional(),
  timeLimit: z.coerce.number().int().positive().optional(),
});

export const assignmentQuestionSchema = z.object({
  questionType: z.enum(['mc', 'fill-blank', 'matching', 'ordering', 'short-answer']),
  prompt: z.string().min(1, '題目為必填'),
  options: z.string().optional(),
  answer: z.string().min(1, '答案為必填'),
  explanation: z.string().optional(),
  orderIndex: z.number().int().min(0).default(0),
});

export const submissionCreateSchema = z.object({
  assignmentId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
  status: z.enum(['pending', 'submitted']).default('submitted'),
});
