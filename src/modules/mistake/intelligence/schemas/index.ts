// Sprint 32: Mistake Intelligence — Zod schemas
import { z } from 'zod';

export const weaknessQuerySchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  category: z.string().optional(),
  includeRecommendations: z.coerce.boolean().optional().default(true),
});

export const trendInputSchema = z.object({
  category: z.string().min(1),
  weeklyCounts: z.array(z.number().int().min(0)),
});
