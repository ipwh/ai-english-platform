// ============================================
// GET /api/teacher/students/[id] — 教師查看個別學生完整詳情
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
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
    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
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
    const student = await db.user.findUnique({
      where: { id: studentId },
      select: {
        id: true, email: true, nameZh: true, nameEn: true,
        level: true, overallAccuracy: true, classNumber: true,
        xp: true, badgeIds: true, streakDays: true, academicYear: true,
        classId: true,
        class: { select: { id: true, name: true, gradeLevel: true } },
        studentClasses: { select: { classId: true } },
      },
    });

    if (!student) {
      return NextResponse.json({ error: '找不到學生' }, { status: 404 });
    }

    // 🔒 Class-level authorization: non-admin teachers can only view students in their own classes
    if (!teacherAuth.isAdmin) {
      const studentClassIds = [
        ...(student.classId ? [student.classId] : []),
        ...(student.studentClasses?.map(sc => sc.classId) || []),
      ];
      if (studentClassIds.length === 0) {
        return NextResponse.json({ error: '學生未分配至任何班級' }, { status: 403 });
      }
      // Check if teacher teaches any of the student's classes
      const teachingRelations = await db.teacherClass.findMany({
        where: {
          teacherId: teacherAuth.userId,
          classId: { in: studentClassIds },
        },
        select: { classId: true },
      });
      if (teachingRelations.length === 0) {
        return NextResponse.json({ error: '無權限查看此學生：不屬於您任教的班級' }, { status: 403 });
      }
    }

    // 並行載入所有關聯數據
    const [
      rawPracticeSessions,
      rawMistakes,
      vocabCount,
      vocabMastered,
      writingDrafts,
      xpTransactions,
      weeklySnapshots,
      submissions,
    ] = await Promise.all([
      db.practiceSession.findMany({
        where: { studentId, source: { not: 'assignment' } },
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: { answers: { orderBy: { questionIndex: 'asc' } } },
      }),
      db.mistake.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.vocabItem.count({ where: { studentId } }),
      db.vocabItem.count({ where: { studentId, familiarity: 'mastered' } }),
      db.writingDraft.findMany({
        where: { studentId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, title: true, prompt: true, status: true, aiSuggestions: true, teacherComment: true, createdAt: true, updatedAt: true },
      }),
      db.xpTransaction.findMany({
        where: { userId: studentId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.weeklySnapshot.findMany({
        where: { userId: studentId },
        orderBy: { weekStart: 'desc' },
        take: 12,
      }),
      db.submission.findMany({
        where: { studentId, status: { in: ['submitted', 'graded'] }, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          score: true,
          submittedAt: true,
          assignment: { select: { title: true, grammarItem: true, difficulty: true, questionCount: true } },
        },
      }),
    ]);

    // 錯題依 questionId 去重，保留最新
    const seenMistakeQIds = new Set<string>();
    const mistakes = rawMistakes.filter(m => {
      if (seenMistakeQIds.has(m.questionId)) return false;
      seenMistakeQIds.add(m.questionId);
      return true;
    });

    const assignmentSessions = submissions.map(submission => {
      const totalQuestions = submission.assignment.questionCount;
      return {
        id: `assignment-${submission.id}`,
        skill: submission.assignment.grammarItem || 'assignment',
        skillZh: submission.assignment.title,
        difficulty: submission.assignment.difficulty,
        totalQuestions,
        correctCount: Math.round(((submission.score || 0) / 100) * totalQuestions),
        source: 'assignment',
        startedAt: submission.submittedAt!,
        completedAt: submission.submittedAt!,
        answers: [],
      };
    });

    // 合併 + 內容去重：相同 skill+題數+正確數+source 只保留最新
    const mergedSessions = [...rawPracticeSessions, ...assignmentSessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .filter((s, _i, arr) => {
        const key = `${s.skill}|${s.totalQuestions}|${s.correctCount}|${s.source}`;
        const firstIdx = arr.findIndex(x => `${x.skill}|${x.totalQuestions}|${x.correctCount}|${x.source}` === key);
        return _i === firstIdx;
      });

    const practiceSessions = mergedSessions;

    return NextResponse.json({
      student,
      practiceSessions,
      mistakes,
      vocab: { total: vocabCount, mastered: vocabMastered },
      writingDrafts,
      xpTransactions,
      weeklySnapshots,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
