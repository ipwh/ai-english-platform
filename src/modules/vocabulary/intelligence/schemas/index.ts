// Sprint 35: Vocabulary Intelligence — Zod schemas
import { z } from 'zod';

export const VOCAB_STATUSES = ['known', 'learning', 'weak', 'forgotten', 'mastered', 'need-review'] as const;

export const vocabProfileQuerySchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  status: z.enum(VOCAB_STATUSES).optional(),
  difficulty: z.string().optional(),
  includeWordFamilies: z.coerce.boolean().optional().default(true),
  reviewLimit: z.coerce.number().int().min(1).max(50).optional().default(10),
});
