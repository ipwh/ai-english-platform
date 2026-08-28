// ============================================
// GET /api/teacher/students — 教師查看任教班級學生
// 支援 JWT + NextAuth 雙重認證
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { findUserByIdSelect, listTeacherClasses, listAllClasses, listUsersAdmin } from '@/modules/student';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { getLastActivityMap, getDominantDifficultyMap, getShortWritingCounts } from '@/modules/teacher/monitoring/services/activity-service';

async function getTeacherInfo(request: NextRequest): Promise<{ userId: string; role: string } | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload && (payload.role === 'teacher' || payload.role === 'admin')) return { userId: payload.userId, role: payload.role };
  }
  const session = await auth();
  if (session?.user?.id) {
    const user = await findUserByIdSelect(session.user.id, { role: true }) as { role: string } | null;
    if (user && (user.role === 'teacher' || user.role === 'admin')) return { userId: session.user.id, role: user.role };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const teacherInfo = await getTeacherInfo(request);
    if (!teacherInfo) {
      return NextResponse.json({ error: '請先登入教師帳號 / Please sign in with a teacher account' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const className = searchParams.get('className') || '';
    const isAdmin = teacherInfo.role === 'admin';

    // Get teacher's taught classes (admins see all classes)
    let taughtClassIds: string[] = [];
    if (!isAdmin) {
      const taughtClasses = await listTeacherClasses(teacherInfo.userId);
      taughtClassIds = taughtClasses.map((tc: { classId: string }) => tc.classId);
    }

    // Build student filter: admins see all, teachers see their taught classes
    const where: Record<string, unknown> = { role: 'student', level: { not: 'Demo' } };
    if (!isAdmin && taughtClassIds.length > 0) {
      where.classId = { in: taughtClassIds };
    }
    if (className) {
      where.class = { name: className };
    }

    const students = await listUsersAdmin({
      where,
      select: {
        id: true, email: true, nameZh: true, nameEn: true,
        level: true, overallAccuracy: true, classNumber: true,
        class: { select: { id: true, name: true, gradeLevel: true } },
        _count: { select: { sessions: true, mistakes: true, writingDrafts: true } },
      },
      orderBy: [{ class: { name: 'asc' } }, { classNumber: 'asc' }],
    });

    // Sprint 133: behavior-based monitoring signals.
    // lastActiveAt = latest of last login / last practice.
    // dominantDifficulty = most-practised difficulty (exposes "題太易" at a glance).
    // shortWritingCount = drafts under the word threshold (exposes "只交極短").
    const studentIds = students.map((s: { id: string }) => s.id);
    const [lastActivity, dominantDifficulty, shortWriting] = await Promise.all([
      getLastActivityMap(studentIds),
      getDominantDifficultyMap(studentIds),
      getShortWritingCounts(studentIds),
    ]);

    const enriched = students.map((s: { id: string }) => {
      const last = lastActivity.get(s.id);
      return {
        ...s,
        lastActiveAt: last ? last.toISOString() : null,
        dominantDifficulty: dominantDifficulty.get(s.id) ?? null,
        shortWritingCount: shortWriting.get(s.id) ?? 0,
      };
    });

    const classes = await listAllClasses();

    return NextResponse.json({ students: enriched, classes, total: enriched.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤 / Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

