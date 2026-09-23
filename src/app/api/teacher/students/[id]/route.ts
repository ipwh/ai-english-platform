// ============================================
// GET /api/teacher/students/[id] — 教師查看個別學生完整詳情
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { findUserByIdSelect, getStudentAnalytics, listTeacherClasses } from '@/modules/student';
import { evaluatePracticeEvidence } from '@/modules/exercise/services/practice-evidence-service';
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
    const user = await findUserByIdSelect(session.user.id, { role: true }) as { role: string } | null;
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
      return NextResponse.json({ error: '請先登入教師帳號 / Please sign in with a teacher account' }, { status: 403 });
    }

    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: '缺少學生 ID / Missing student ID' }, { status: 400 });
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
      return NextResponse.json({ error: '找不到學生 / Student not found' }, { status: 404 });
    }

    // 🔒 Class-level authorization: non-admin teachers can only view students in their own classes
    if (!teacherAuth.isAdmin) {
      const studentClassIds = [
        ...(student.classId ? [student.classId] : []),
        ...((student.studentClasses || []) as Array<{ classId: string }>).map((sc) => sc.classId),
      ];
      if (studentClassIds.length === 0) {
        return NextResponse.json({ error: '學生未分配至任何班級 / Student is not assigned to any class' }, { status: 403 });
      }
      // Check if teacher teaches any of the student's classes
      const teachingRelations = await listTeacherClasses(teacherAuth.userId);
      const teachingClassIds = (teachingRelations as Array<{ classId: string }>).map((tc) => tc.classId);
      if (!teachingClassIds.some((id) => studentClassIds.includes(id))) {
        return NextResponse.json({ error: '無權限查看此學生：不屬於您任教的班級 / You cannot view this student — they are not in a class you teach' }, { status: 403 });
      }
    }

    const analytics = await getStudentAnalytics(studentId);
    const { sessions: rawPracticeSessions, mistakes, vocabTotal, vocabMastered, drafts: writingDrafts, xp: xpTransactions, snapshots: weeklySnapshots, submissions } = analytics;

    // R3.10-C: 每筆 session 附上 verified row-derived 聚合值；
    // 零答案 / 歷史不可驗證的 sessions → verified = { status: 'unverifiable' }。
    const practiceSessions = (rawPracticeSessions as Array<Record<string, unknown>>).map(s => ({
      ...s,
      verified: evaluatePracticeEvidence(s.answers),
    }));

    // 2026-09-23 稽核修正：累積（全歷史）技能題數／答對數由正典投影提供。
    // `practiceSessions` 只是「最新 50 場」顯示視窗，頁面不得再由它推算累積數字
    //（那會令高練習量學生的答題數與準確率被截斷）。
    const { getCumulativeSkillTotals } = await import('@/modules/exercise/services/practice-history-service');
    const cumulativeSkillTotals = await getCumulativeSkillTotals(studentId).catch(() => []);

    return NextResponse.json({
      student,
      practiceSessions,
      cumulativeSkillTotals,
      mistakes,
      vocab: { total: vocabTotal, mastered: vocabMastered },
      writingDrafts,
      xpTransactions,
      weeklySnapshots,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤 / Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
