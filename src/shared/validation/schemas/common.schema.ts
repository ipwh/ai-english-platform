// Sprint 6: Common schemas — shared types used across modules
import { z } from 'zod';

export const studentId = z.string().min(1, 'studentId 為必填');
export const userId = z.string().min(1, 'userId 為必填');
export const teacherId = z.string().min(1, 'teacherId 為必填');
export const classId = z.string().min(1, 'classId 為必填');
export const assignmentId = z.string().min(1, 'assignmentId 為必填');

export const difficulty = z.enum(['remedial', 'core', 'challenge']);
export const gradeLevel = z.string().regex(/^S[1-6]$/, 'gradeLevel 必須為 S1-S6');
export const role = z.enum(['student', 'teacher', 'admin']);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const optionalString = z.string().optional();
export const optionalNumber = z.coerce.number().optional();
