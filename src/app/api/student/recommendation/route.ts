// Sprint 33: GET /api/student/recommendation
// Sprint 58: Delegates through StudentTwin (canonical entry point)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { recommendationQuerySchema } from '@/modules/recommendation/schemas';
import { studentTwinService } from '@/modules/student-twin/services/student-twin-service';

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

    const result = await studentTwinService.getRecommendations(studentId, type, limit, includeBreakdown);
    return NextResponse.json({ studentId, type: type || 'full', recommendations: result, generatedAt: new Date() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'recommendation', error: message }, 'GET /api/student/recommendation failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
