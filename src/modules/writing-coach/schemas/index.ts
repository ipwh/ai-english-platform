// Sprint 36: Writing Coach 2.0 — Zod schemas
import { z } from 'zod';

export const writingCoachV2Schema = z.object({
  essayId: z.string().min(1),
  studentId: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(10, 'Essay text must be at least 10 characters'),
  wordLimit: z.number().int().min(50).max(2000).optional(),
  textType: z.string().optional(),
});
