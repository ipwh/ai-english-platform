// Sprint 38: GET /api/teacher/copilot/assignments
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
    if (authResult.role !== 'admin' && classId !== 'default' && !await verifyTeacherOwnsClass(authResult.userId!, classId)) {
      return NextResponse.json({ error: 'You do not have access to this class' }, { status: 403 });
    }
    const assignments = await teacherCopilotService.generateAssignments(classId);
    return NextResponse.json({ assignments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'teacher-copilot', error: msg }, 'Assignments failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
