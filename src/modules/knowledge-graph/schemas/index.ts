// Sprint 34: Knowledge Graph — Zod schemas
import { z } from 'zod';

export const graphQuerySchema = z.object({
  skill: z.string().optional(),
  cefr: z.string().optional(),
  hkdse: z.string().optional(),
  includeNodes: z.coerce.boolean().optional().default(true),
  includeEdges: z.coerce.boolean().optional().default(true),
});

export const nodeParamsSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
});

export const learningOrderQuerySchema = z.object({
  skill: z.string().optional(),
});

export const masteryDataSchema = z.object({
  nodeId: z.string().min(1),
  currentMastery: z.number().int().min(0).max(100),
});

export const learningPathBodySchema = z.object({
  studentId: z.string().min(1),
  masteryScores: z.record(z.string(), z.number().int().min(0).max(100)).optional().default({}),
  strategy: z.enum(['shortest-time', 'highest-importance', 'weakness-first', 'balanced', 'exam-prep']).optional().default('balanced'),
  gradeLevel: z.string().optional().default('S4'),
  skillFocus: z.string().optional(),
  targetNodeId: z.string().optional(),
  maxNodes: z.number().int().min(1).max(50).optional().default(10),
  maxTimeMinutes: z.number().int().min(5).max(480).optional(),
});

export const recommendNextBodySchema = z.object({
  studentId: z.string().min(1),
  masteryData: z.array(masteryDataSchema),
  gradeLevel: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional().default(5),
});
