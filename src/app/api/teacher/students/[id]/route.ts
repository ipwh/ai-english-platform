// ============================================
// GET /api/teacher/students/[id] — 教師查看個別學生完整詳情
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { findUserByIdSelect, getStudentAnalytics, listTeacherClasses } from '@/modules/student';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';

async function getTeacherAuth(request: NextRequest): Promise<{ userId: string; isAdmin: boolean } | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload && (payload.role === 'teacher' || payload.role === 'admin')) {
      return { userId: payload.userId, isAdmin: payload.role === 'admin' };
    }
  }
  const session = await auth();
  if (session?.user?.id) {
    const user = await findUserByIdSelect(session.user.id, { role: true });
    if (user && (user.role === 'teacher' || user.role === 'admin')) {
      return { userId: session.user.id, isAdmin: user.role === 'admin' };
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherAuth = await getTeacherAuth(request);
    if (!teacherAuth) {
      return NextResponse.json({ error: '請先登入教師帳號' }, { status: 403 });
    }

    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: '缺少學生 ID' }, { status: 400 });
    }

    // 學生基本資料
    const student = await findUserByIdSelect(studentId, {
      id: true, email: true, nameZh: true, nameEn: true,
      level: true, overallAccuracy: true, classNumber: true,
      xp: true, badgeIds: true, streakDays: true, academicYear: true,
      classId: true,
      class: { select: { id: true, name: true, gradeLevel: true } },
      studentClasses: { select: { classId: true } },
    });

    if (!student) {
      return NextResponse.json({ error: '找不到學生' }, { status: 404 });
    }

    // 🔒 Class-level authorization: non-admin teachers can only view students in their own classes
    if (!teacherAuth.isAdmin) {
      const studentClassIds = [
        ...(student.classId ? [student.classId] : []),
        ...(student.studentClasses?.map((sc: { classId: string }) => sc.classId) || []),
      ];
      if (studentClassIds.length === 0) {
        return NextResponse.json({ error: '學生未分配至任何班級' }, { status: 403 });
      }
      // Check if teacher teaches any of the student's classes
      const teachingRelations = await listTeacherClasses(teacherAuth.userId);
      const teachingClassIds = teachingRelations.map((tc: any) => tc.classId);
      if (!teachingClassIds.some((id: string) => studentClassIds.includes(id))) {
        return NextResponse.json({ error: '無權限查看此學生：不屬於您任教的班級' }, { status: 403 });
      }
    }

    const analytics = await getStudentAnalytics(studentId);
    const { sessions: rawPracticeSessions, mistakes, vocabTotal, vocabMastered, drafts: writingDrafts, xp: xpTransactions, snapshots: weeklySnapshots, submissions } = analytics;

    return NextResponse.json({
      student,
      practiceSessions: rawPracticeSessions,
      mistakes,
      vocab: { total: vocabTotal, mastered: vocabMastered },
      writingDrafts,
      xpTransactions,
      weeklySnapshots,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
