// Sprint 32: GET /api/student/weakness
// Sprint 59: Uses StudentStateBuilder (canonical state)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { weaknessQuerySchema } from '@/modules/mistake/intelligence/schemas';
import { studentStateBuilder } from '@/modules/student/state/StudentStateBuilder';
import { studentBelongsToTeacher } from '@/modules/teacher/services/student-access';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(weaknessQuerySchema, searchParams);
    const { studentId, limit, category, includeRecommendations } = query;

    // Ownership: students can only see their own weakness data; teachers only students in their taught classes
    if (authResult.role === 'student' && studentId !== authResult.userId) {
      return NextResponse.json(
        { error: 'You can only view your own weakness data' },
        { status: 403 },
      );
    }
    if (authResult.role === 'teacher' && !(await studentBelongsToTeacher(studentId, authResult.userId!))) {
      return NextResponse.json({ error: 'Forbidden — you do not teach this student' }, { status: 403 });
    }

    const state = await studentStateBuilder.build(studentId);
    const weakness = state.weakness;

    if (!weakness) {
      return NextResponse.json({ studentId, topWeaknesses: [], totalMistakes: 0 });
    }

    // If a specific category is requested, filter by name
    if (category) {
      const filtered = weakness.topWeaknesses.filter(
        (w) => w.name === category,
      );
      return NextResponse.json({
        studentId,
        category,
        topWeaknesses: filtered,
        totalMistakes: weakness.totalMistakes,
        generatedAt: state.generatedAt,
      });
    }

    return NextResponse.json({
      ...weakness,
      generatedAt: state.generatedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'mistake-intelligence', error: message }, 'GET /api/student/weakness failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
