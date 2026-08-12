// Sprint 38: POST /api/teacher/copilot/generate
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import { generationRequestSchema } from '@/modules/teacher/copilot/schemas';
import { teacherCopilotService, verifyTeacherOwnsClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';

export async function POST(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.role !== 'teacher' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = generationRequestSchema.parse(body);
    const { type, teacherId, classId, gradeLevel, topic, topicZh, questionCount, difficulty } = parsed;

    // Route to appropriate service method
    let result: unknown;
    const effectiveClassId = classId || teacherId; // Use classId from frontend, fallback to teacherId

    // Verify teacher owns this class (admins bypass)
    if (auth.role !== 'admin' && effectiveClassId && !await verifyTeacherOwnsClass(auth.userId!, effectiveClassId)) {
      return NextResponse.json({ error: 'Unauthorized — you do not teach this class' }, { status: 403 });
    }

    switch (type) {
      case 'homework':
      case 'worksheet':
      case 'class-quiz':
      case 'revision-paper':
      case 'remedial-exercises':
        result = await teacherCopilotService.generateAssignments(effectiveClassId);
        break;
      default:
        result = {
          type,
          title: topic,
          titleZh: topicZh,
          content: `Generated ${type} for ${topicZh} (${gradeLevel}, ${difficulty}, ${questionCount} questions)`,
          generatedAt: new Date(),
        };
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'teacher-copilot', error: message }, 'POST generate failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
