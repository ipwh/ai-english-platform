// Sprint 38: GET /api/teacher/copilot/lesson-plan
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { teacherCopilotService } from '@/modules/teacher-copilot/services/teacher-copilot-service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId') || 'default';
    const className = searchParams.get('className') || classId;
    const plan = await teacherCopilotService.generateLessonPlan(classId, className);
    return NextResponse.json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'teacher-copilot', error: msg }, 'Lesson plan failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
