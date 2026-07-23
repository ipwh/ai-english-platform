// Sprint 38: Teacher Copilot — Zod schemas
import { z } from 'zod';

export const GENERATION_TYPES = ['homework', 'worksheet', 'class-quiz', 'revision-paper', 'remedial-exercises', 'marking-scheme'] as const;

export const generationRequestSchema = z.object({
  type: z.enum(GENERATION_TYPES),
  teacherId: z.string().min(1),
  gradeLevel: z.string().min(1),
  topic: z.string().min(1),
  topicZh: z.string().min(1),
  questionCount: z.number().int().min(1).max(50).optional().default(10),
  difficulty: z.enum(['remedial', 'core', 'challenge']).optional().default('core'),
  instructions: z.string().optional(),
});

export const copilotQuerySchema = z.object({
  teacherId: z.string().min(1),
  classId: z.string().optional(),
  gradeLevel: z.string().optional(),
  includeActivities: z.coerce.boolean().optional().default(true),
  includeWeakTopics: z.coerce.boolean().optional().default(true),
});
