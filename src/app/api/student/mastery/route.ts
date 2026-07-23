// Sprint 31: GET /api/student/mastery
// Sprint 59: Uses StudentStateBuilder (canonical state)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { masteryQuerySchema } from '@/modules/student/mastery/schemas';
import { studentStateBuilder } from '@/modules/student/state/StudentStateBuilder';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(masteryQuerySchema, searchParams);
    const { studentId, skill } = query;

    // Ownership: students can only see their own mastery
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: 'You can only view your own mastery data' }, { status: 403 });
    }

    const state = await studentStateBuilder.build(studentId);
    const mastery = state.mastery;

    if (skill) {
      return NextResponse.json({
        studentId,
        skill,
        mastery: mastery.bySkill[skill],
        generatedAt: state.generatedAt,
      });
    }

    return NextResponse.json({
      studentId,
      overallMastery: mastery.overallScore,
      bySkill: mastery.bySkill,
      weakestSkills: mastery.weakSkills,
      strongestSkills: mastery.strongSkills,
      totalPractices: Object.values(mastery.bySkill).reduce((s: number, sk: any) => s + sk.practiceCount, 0),
      generatedAt: state.generatedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'student-mastery', error: message }, 'Failed to get mastery');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
