// Sprint 33: Recommendation Engine 2.0 — Zod schemas
import { z } from 'zod';

export const RECOMMENDATION_TYPES = ['exercise', 'grammar', 'vocabulary', 'writing'] as const;

export const recommendationQuerySchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  type: z.enum(RECOMMENDATION_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
  includeBreakdown: z.coerce.boolean().optional().default(true),
});
