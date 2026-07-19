// Sprint 37: GET /api/teacher/dashboard
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { teacherDashboardQuerySchema } from '@/modules/learning-analytics/schemas';
import { buildTeacherDashboard } from '@/modules/learning-analytics/services/learning-analytics-service';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (auth.role !== 'teacher' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher or admin access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(teacherDashboardQuerySchema, searchParams);
    const { teacherId, classId, gradeLevel } = query;

    const dashboard = await buildTeacherDashboard({ teacherId, classId, gradeLevel });

    return NextResponse.json(dashboard);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'learning-analytics', error: message }, 'GET /api/teacher/dashboard failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
