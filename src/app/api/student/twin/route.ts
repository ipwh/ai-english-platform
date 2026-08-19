// Sprint 37: GET /api/student/twin — complete digital twin
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { studentTwinService } from '@/modules/student/twin/services/student-twin-service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || authResult.userId!;

    // Students can only see their own twin
    if (authResult.role === 'student' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的學習檔案 / You can only view your own learning profile' }, { status: 403 });
    }

    const twin = await studentTwinService.buildTwin(studentId);
    return NextResponse.json({ twin });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'student-twin', error: msg }, 'Failed to build twin');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
