// Sprint 31: GET /api/student/mastery
// Sprint 58: Delegates through StudentTwin (canonical entry point)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { masteryQuerySchema } from '@/modules/student-mastery/schemas';
import { studentTwinService } from '@/modules/student-twin/services/student-twin-service';

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

    const profile = await studentTwinService.getMasteryProfile(studentId);

    // If a specific skill is requested, return only that skill's data
    if (skill) {
      return NextResponse.json({
        studentId,
        skill,
        mastery: profile.bySkill[skill],
        generatedAt: profile.generatedAt,
      });
    }

    return NextResponse.json(profile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'student-mastery', error: message }, 'Failed to get mastery');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
