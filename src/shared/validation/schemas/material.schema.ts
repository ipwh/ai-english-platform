// Sprint 6+: Material/RAG API Schemas
import { z } from 'zod';

export const materialCreateSchema = z.object({
  title: z.string().min(1, '教材名稱為必填'),
  description: z.string().optional(),
  type: z.enum(['pdf', 'docx', 'image', 'ppt', 'video', 'audio', 'link', 'text']),
  fileUrl: z.string().url().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  gradeLevel: z.string().optional(),
  strand: z.string().optional(),
});

export const materialUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  gradeLevel: z.string().optional(),
  strand: z.string().optional(),
});

export const ragQuerySchema = z.object({
  query: z.string().min(1, '查詢內容為必填'),
  materialIds: z.array(z.string()).optional(),
  topK: z.coerce.number().int().min(1).max(20).default(5),
  minScore: z.coerce.number().min(0).max(1).default(0.3),
});

export const ragIndexSchema = z.object({
  materialId: z.string().min(1),
  forceReindex: z.boolean().default(false),
});

export const ocrRequestSchema = z.object({
  materialId: z.string().min(1),
  language: z.string().default('zh+en'),
});
