// Sprint 38: GET /api/teacher/copilot/exam-prediction
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { teacherCopilotService, verifyTeacherOwnsClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId') || 'default';

    // Verify teacher owns this class (admins bypass)
    if (authResult.role !== 'admin' && !await verifyTeacherOwnsClass(authResult.userId!, classId)) {
      return NextResponse.json({ error: 'Unauthorized — you do not teach this class' }, { status: 403 });
    }

    const prediction = await teacherCopilotService.predictExam(classId);
    return NextResponse.json({ prediction });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'teacher-copilot', error: msg }, 'Exam prediction failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
