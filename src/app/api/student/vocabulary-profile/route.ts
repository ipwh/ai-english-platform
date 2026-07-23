// Sprint 35: GET /api/student/vocabulary-profile
// Sprint 59: Uses StudentStateBuilder (canonical state)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { vocabProfileQuerySchema } from '@/modules/vocabulary/intelligence/schemas';
import { studentStateBuilder } from '@/modules/student/state/StudentStateBuilder';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(vocabProfileQuerySchema, searchParams);
    const { studentId, status, difficulty, includeWordFamilies, reviewLimit } = query;

    // Ownership
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      studentId !== authResult.userId
    ) {
      return NextResponse.json(
        { error: 'You can only view your own vocabulary profile' },
        { status: 403 },
      );
    }

    const state = await studentStateBuilder.build(studentId);
    const profile = state.vocabulary;

    if (!profile) {
      return NextResponse.json({ studentId, error: 'Vocabulary profile not available' }, { status: 404 });
    }

    return NextResponse.json({
      studentId,
      total: profile.total,
      byStatus: profile.byStatus,
      reviewQueue: profile.reviewQueue,
      generatedAt: state.generatedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'vocabulary-intelligence', error: message }, 'GET /api/student/vocabulary-profile failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
