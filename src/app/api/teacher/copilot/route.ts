// Sprint 38: GET /api/teacher/copilot
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { copilotQuerySchema } from '@/modules/teacher/copilot/schemas';
import { teacherCopilotService, verifyTeacherOwnsClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.role !== 'teacher' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(copilotQuerySchema, searchParams);
    const { teacherId, classId: qClassId } = query;
    const classId = qClassId ?? teacherId;

    if (auth.role !== 'admin' && classId && !await verifyTeacherOwnsClass(auth.userId!, classId)) {
      return NextResponse.json({ error: 'You do not have access to this class' }, { status: 403 });
    }

    const plan = classId
      ? await teacherCopilotService.generateLessonPlan(classId, `Class ${classId}`)
      : null;

    const assignments = classId
      ? await teacherCopilotService.generateAssignments(classId)
      : null;

    return NextResponse.json({
      teacherId,
      classId,
      lessonPlan: plan,
      assignments,
      generatedAt: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'teacher-copilot', error: message }, 'GET copilot failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
