// Sprint 34: POST /api/knowledge-graph/learning-path
// Generate a personalized learning path given student mastery data
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import { learningPathGenerator } from '@/modules/knowledge-graph/services/learning-path-generator';
import type { GeneratedLearningPath } from '@/modules/knowledge-graph/types';

const learningPathSchema = z.object({
  studentId: z.string().min(1),
  masteryScores: z.record(z.string(), z.number().int().min(0).max(100)).optional().default({}),
  strategy: z.enum(['shortest-time', 'highest-importance', 'weakness-first', 'balanced', 'exam-prep']).optional().default('balanced'),
  gradeLevel: z.string().optional().default('S4'),
  skillFocus: z.string().optional(),
  targetNodeId: z.string().optional(),
  maxNodes: z.number().int().min(1).max(50).optional().default(10),
  maxTimeMinutes: z.number().int().min(5).max(480).optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = learningPathSchema.parse(body);

    // Ownership check
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      parsed.studentId !== authResult.userId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const path: GeneratedLearningPath = learningPathGenerator.generate({
      studentId: parsed.studentId,
      strategy: parsed.strategy,
      gradeLevel: parsed.gradeLevel,
      masteryScores: parsed.masteryScores,
      targetNodeId: parsed.targetNodeId,
      skillFocus: parsed.skillFocus,
      maxNodes: parsed.maxNodes,
      maxTimeMinutes: parsed.maxTimeMinutes,
    });

    return NextResponse.json({
      studentId: parsed.studentId,
      strategy: parsed.strategy,
      path,
      generatedAt: new Date(),
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'knowledge-graph', error: message }, 'POST /api/knowledge-graph/learning-path failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
