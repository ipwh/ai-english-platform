// Sprint 6+: Admin API Schemas
import { z } from 'zod';

export const adminCreateClassSchema = z.object({
  name: z.string().min(1, '班級名稱為必填'),
  gradeLevel: z.string().regex(/^S[1-6]$/, '年級格式必須為 S1-S6'),
  academicYear: z.string().optional().default('2025-2026'),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().optional(),
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  role: z.enum(['student', 'teacher', 'admin']).optional(),
  classId: z.string().optional(),
  classNumber: z.string().optional(),
  level: z.string().optional(),
});

export const adminCreateUserSchema = z.object({
  email: z.string().email('電郵格式不正確'),
  name: z.string().min(1, '名稱為必填'),
  role: z.enum(['student', 'teacher', 'admin']),
  password: z.string().min(6, '密碼至少 6 個字元').optional(),
  classId: z.string().optional(),
  gradeLevel: z.string().regex(/^S[1-6]$/).optional(),
});

export const adminExportSheetsSchema = z.object({
  classIds: z.array(z.string()).min(1, '至少選擇一個班級'),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
});

export const adminFixClassesSchema = z.object({
  dryRun: z.boolean().default(true),
  classMappings: z.array(z.object({
    studentEmail: z.string().email(),
    targetClassId: z.string(),
  })).optional(),
});

export const adminSyncSheetsSchema = z.object({
  sheetUrl: z.string().url('Google Sheet URL 格式不正確'),
  sheetName: z.string().optional(),
  syncMode: z.enum(['full', 'incremental']).default('incremental'),
});
