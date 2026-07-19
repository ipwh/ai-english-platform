// Sprint 34: POST /api/knowledge-graph/recommend-next
// Recommend the next skill(s) for a student to learn
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
import { skillDependencyResolver } from '@/modules/knowledge-graph/services/skill-dependency-resolver';
import type { MasteryData } from '@/modules/knowledge-graph/services/dependency-resolver';

const recommendNextSchema = z.object({
  studentId: z.string().min(1),
  masteryData: z.array(z.object({
    nodeId: z.string(),
    currentMastery: z.number().int().min(0).max(100),
  })),
  gradeLevel: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = recommendNextSchema.parse(body);

    // Ownership check
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      parsed.studentId !== authResult.userId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const masteryData: MasteryData[] = parsed.masteryData;

    // Get unlocked skills
    const unlocked = knowledgeGraphService.getUnlockedSkills(parsed.studentId, masteryData);

    // Get recommended next from service
    const recommended = knowledgeGraphService.getRecommendedNext(
      parsed.studentId,
      masteryData,
      parsed.gradeLevel ?? 'S4',
      parsed.limit,
    );

    // Get bottleneck detection
    const masteredIds = masteryData.filter(m => m.currentMastery >= 70).map(m => m.nodeId);
    const bottlenecks = skillDependencyResolver.findBottlenecks({ masteredNodeIds: masteredIds });

    // Get next skill predictions
    const masteryScores: Record<string, number> = {};
    for (const m of masteryData) {
      masteryScores[m.nodeId] = m.currentMastery;
    }
    const predictions = skillDependencyResolver.predictNextSkills({
      studentId: parsed.studentId,
      masteryScores,
      masteredNodeIds: masteredIds,
      gradeLevel: parsed.gradeLevel ?? 'S4',
    });

    return NextResponse.json({
      studentId: parsed.studentId,
      unlockedCount: unlocked.newlyUnlocked.length,
      lockedCount: unlocked.stillLocked.length,
      recommended,
      bottlenecks,
      predictions,
      generatedAt: new Date(),
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'knowledge-graph', error: message }, 'POST /api/knowledge-graph/recommend-next failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
