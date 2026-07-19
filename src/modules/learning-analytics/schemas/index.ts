// Sprint 37: Learning Analytics — Zod schemas
import { z } from 'zod';

export const studentAnalyticsQuerySchema = z.object({
  studentId: z.string().min(1),
  weeks: z.coerce.number().int().min(1).max(52).optional().default(12),
});

export const teacherDashboardQuerySchema = z.object({
  teacherId: z.string().min(1),
  classId: z.string().optional(),
  gradeLevel: z.string().optional(),
});
