// Sprint 37: GET /api/student/analytics
// Sprint 58: Delegates through StudentTwin (canonical entry point)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { studentAnalyticsQuerySchema } from '@/modules/learning-analytics/schemas';
import { studentTwinService } from '@/modules/student-twin/services/student-twin-service';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(studentAnalyticsQuerySchema, searchParams);
    const { studentId, weeks } = query;

    if (auth.role !== 'teacher' && auth.role !== 'admin' && studentId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { trends, stats } = await studentTwinService.getAnalytics(studentId, weeks);

    return NextResponse.json({ trends, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'learning-analytics', error: message }, 'GET /api/student/analytics failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
