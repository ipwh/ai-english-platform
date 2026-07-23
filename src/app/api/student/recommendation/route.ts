// Sprint 33: GET /api/student/recommendation
// Sprint 59: Uses StudentStateBuilder (canonical state)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { recommendationQuerySchema } from '@/modules/learning/schemas/recommendation-schema';
import { studentStateBuilder } from '@/modules/student/state/StudentStateBuilder';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(recommendationQuerySchema, searchParams);
    const { studentId, type, limit, includeBreakdown } = query;

    // Ownership: students can only see their own recommendations
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      studentId !== authResult.userId
    ) {
      return NextResponse.json(
        { error: 'You can only view your own recommendations' },
        { status: 403 },
      );
    }

    const state = await studentStateBuilder.build(studentId);
    return NextResponse.json({
      studentId,
      type: type || 'full',
      recommendations: state.knowledge.weakSkills.map(s => ({
        skill: s.skill,
        score: s.currentScore,
        trend: s.trend,
      })),
      weakSkills: state.mastery.weakSkills,
      strongSkills: state.mastery.strongSkills,
      generatedAt: state.generatedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'recommendation', error: message }, 'GET /api/student/recommendation failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
