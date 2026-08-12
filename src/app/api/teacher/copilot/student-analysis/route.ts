// Sprint 38: GET /api/teacher/copilot/student-analysis
// Sprint 132: Supports name lookup — resolution + authorization in service layer
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import {
  teacherCopilotService,
  verifyTeacherOwnsClass,
  resolveTeacherStudentClass,
} from '@/modules/teacher/copilot/services/teacher-copilot-service';
import { studentTwinService } from '@/modules/student/twin/services/student-twin-service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const studentIdOrName = searchParams.get('studentId');
    if (!studentIdOrName) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const rawClassId = searchParams.get('classId');
    let classId: string;

    if (rawClassId && authResult.role !== 'admin') {
      // Class specified — verify teacher owns it
      if (!await verifyTeacherOwnsClass(authResult.userId!, rawClassId)) {
        return NextResponse.json({ error: 'Unauthorized — you do not teach this class' }, { status: 403 });
      }
      classId = rawClassId;
    } else if (authResult.role === 'admin') {
      classId = rawClassId || 'default';
    } else {
      // No class specified — resolve student and find which of teacher's classes they're in
      const studentId = await studentTwinService.resolveStudentId(studentIdOrName);
      const resolvedClass = await resolveTeacherStudentClass(authResult.userId!, studentId);
      if (!resolvedClass) {
        return NextResponse.json({ error: 'Student not found in any of your classes' }, { status: 403 });
      }
      classId = resolvedClass;
    }

    const analysis = await teacherCopilotService.analyzeStudent(studentIdOrName, classId);
    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Map known errors to HTTP status codes
    if (msg.includes('No student found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('Multiple students matched')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes('does not belong to class')) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    logger.error({ module: 'teacher-copilot', error: msg }, 'Student analysis failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
