// Sprint 6+: Group API Schemas
import { z } from 'zod';

export const groupCreateSchema = z.object({
  name: z.string().min(1, '組別名稱為必填').max(100),
  description: z.string().max(500).optional(),
  studentIds: z.array(z.string()).optional(),
});

export const groupUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const groupAddMembersSchema = z.object({
  studentIds: z.array(z.string()).min(1, '至少選擇一位學生'),
});

export const groupRemoveMembersSchema = z.object({
  studentIds: z.array(z.string()).min(1, '至少選擇一位學生'),
});
