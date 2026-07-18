// Sprint 6: Auth schemas — login, register, settings
import { z } from 'zod';
import { gradeLevel } from './common.schema';

export const loginSchema = z.object({
  email: z.string().email('請輸入有效的電郵地址'),
  password: z.string().min(6, '密碼至少 6 個字元'),
  role: z.enum(['student', 'teacher']).optional(),
});

export const registerSchema = z.object({
  email: z.string().email('請輸入有效的電郵地址'),
  password: z.string().min(6, '密碼至少 6 個字元'),
  name: z.string().min(1, '姓名為必填'),
  role: z.enum(['student', 'teacher']),
  gradeLevel: gradeLevel.optional(),
  classId: z.string().optional(),
});

export const settingsSchema = z.object({
  subjects: z.array(z.string()).optional(),
  gradeLevel: gradeLevel.optional(),
  language: z.enum(['zh', 'en']).optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const roleUpdateSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['student', 'teacher', 'admin']),
});
