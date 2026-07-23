// Sprint 39: Adaptive Learning — Zod schemas
import { z } from 'zod';

export const pipelineInputSchema = z.object({
  studentId: z.string().min(1),
  gradeLevel: z.string().min(1).default('S4'),
  focusSkill: z.string().optional(),
  maxRecommendations: z.number().int().min(1).max(10).optional().default(5),
});
