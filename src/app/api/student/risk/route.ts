// Sprint 37: GET /api/student/risk — risk assessment
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { studentTwinService } from '@/modules/student-twin/services/student-twin-service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || authResult.userId!;

    if (authResult.role === 'student' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的風險評估' }, { status: 403 });
    }

    const risks = await studentTwinService.getRiskAssessment(studentId);
    return NextResponse.json({ risks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'student-twin', error: msg }, 'Failed to get risk assessment');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
