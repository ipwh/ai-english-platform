// Sprint 26: Curriculum API
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { curriculumEngine } from '@/modules/curriculum/services/curriculum-engine';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const curriculumId = searchParams.get('curriculumId') || 'hkdse-english';
  const courseId = searchParams.get('courseId') || '';
  const grade = searchParams.get('grade') || '';
  const studentId = auth.userId || '';

  try {
    let result: unknown;
    switch (action) {
      case 'list': result = curriculumEngine.listCurricula(); break;
      case 'curriculum': result = curriculumEngine.getCurriculum(curriculumId); break;
      case 'course': result = curriculumEngine.getCourse(curriculumId, courseId); break;
      case 'unit': result = curriculumEngine.getUnit(curriculumId, searchParams.get('unitId') || ''); break;
      case 'by-grade': result = curriculumEngine.getCoursesByGrade(curriculumId, grade); break;
      case 'progress': {
        const completed = searchParams.get('completed')?.split(',') || [];
        result = curriculumEngine.calculateProgress(curriculumId, studentId, completed, [], new Date().toISOString().slice(0, 10));
        break;
      }
      case 'knowledge-nodes': result = curriculumEngine.getKnowledgeNodeIds(curriculumId); break;
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
