// Sprint 31: Student Mastery — Zod schemas
import { z } from 'zod';
import { MASTERY_SKILLS } from '../types';

export const masteryQuerySchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  skill: z.enum(MASTERY_SKILLS).optional(),
  includeSubSkills: z.coerce.boolean().optional().default(true),
});

export const exerciseResultSchema = z.object({
  studentId: z.string().min(1),
  skill: z.enum(MASTERY_SKILLS),
  subSkill: z.string().min(1),
  totalQuestions: z.number().int().min(1),
  correctCount: z.number().int().min(0),
});
