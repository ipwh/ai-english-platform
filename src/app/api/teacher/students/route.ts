// ============================================
// GET /api/teacher/students — 教師查看任教班級學生
// 支援 JWT + NextAuth 雙重認證
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { findUserByIdSelect, listTeacherClasses, listAllClasses, listUsersAdmin } from '@/modules/student';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { getLastActivityMap, getDominantDifficultyMap, getShortWritingCounts, classifyActivityStatus } from '@/modules/teacher/monitoring/services/activity-service';

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
    let taughtClasses: Array<{ classId: string; class: { id: string; name: string; gradeLevel: string } }> = [];
    let taughtClassIds: string[] = [];
    if (!isAdmin) {
      taughtClasses = (await listTeacherClasses(teacherInfo.userId))
        .filter(({ class: taughtClass }) => taughtClass.name !== 'Demo');
      taughtClassIds = taughtClasses.map((tc: { classId: string }) => tc.classId);
      if (taughtClassIds.length === 0) {
        return NextResponse.json({ students: [], classes: [], total: 0 });
      }
    }

    // Build student filter: admins see all, teachers see their taught classes
    // 2026-09-03: 只列出仍在學校最新名單的學生。sync-sheets / unassign-non-roster
    // 已把「不在最新名單」的畢業生/轉校生解除班別（classId=null，保留學習紀錄），
    // 因此以「仍有班別」篩選即可隱藏舊生，避免與現有學生混淆。
    const membershipFilter = {
      OR: [
        { classId: { not: null } },
        { studentClasses: { some: {} } },
      ],
    };
    const where: Record<string, unknown> = {
      role: 'student',
      level: { not: 'Demo' },
      AND: [membershipFilter],
    };
    if (!isAdmin && taughtClassIds.length > 0) {
      (where.AND as Record<string, unknown>[]).push({
        OR: [
          { classId: { in: taughtClassIds } },
          { studentClasses: { some: { classId: { in: taughtClassIds } } } },
        ],
      });
    }
    if (className) {
      (where.AND as Record<string, unknown>[]).push({
        OR: [
          { class: { name: className } },
          { studentClasses: { some: { class: { name: className } } } },
        ],
      });
    }

    const students = await listUsersAdmin({
      where,
      select: {
        id: true, email: true, nameZh: true, nameEn: true,
        level: true, overallAccuracy: true, classNumber: true,
        class: { select: { id: true, name: true, gradeLevel: true } },
        studentClasses: { select: { class: { select: { id: true, name: true, gradeLevel: true } } } },
        _count: { select: { sessions: true, mistakes: true, writingDrafts: true } },
      },
      orderBy: [{ class: { name: 'asc' } }, { classNumber: 'asc' }],
    });

    // Sprint 133: behavior-based monitoring signals.
    // lastActiveAt = latest of last login / last practice / last draft / last submission.
    // dominantDifficulty = most-practised difficulty (exposes "題太易" at a glance).
    // shortWritingCount = drafts under the word threshold (exposes "只交極短").
    // 2026-09-21 稽核：活躍狀態與天數門檻一律由伺服器計算（單一 owner，
    // 見 `activity-service.classifyActivityStatus`），令名單與班級詳情
    // 不可能出現兩套不一致的判定；「從未開始」亦與「長期未活動」分開。
    const studentIds = students.map((s: { id: string }) => s.id);
    const [lastActivity, dominantDifficulty, shortWriting] = await Promise.all([
      getLastActivityMap(studentIds),
      getDominantDifficultyMap(studentIds),
      getShortWritingCounts(studentIds),
    ]);

    const enriched = students.map((s: { id: string; _count?: { sessions?: number } }) => {
      const last = lastActivity.get(s.id);
      const { status, daysInactive } = classifyActivityStatus(last ?? null);
      return {
        ...s,
        lastActiveAt: last ? last.toISOString() : null,
        daysInactive,
        activityStatus: status,
        dominantDifficulty: dominantDifficulty.get(s.id) ?? null,
        shortWritingCount: shortWriting.get(s.id) ?? 0,
      };
    });

    const classes = isAdmin ? (await listAllClasses()).filter(({ name }) => name !== 'Demo') : taughtClasses.map(({ class: taughtClass }) => ({
      id: taughtClass.id,
      name: taughtClass.name,
      gradeLevel: taughtClass.gradeLevel,
    }));

    return NextResponse.json({ students: enriched, classes, total: enriched.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤 / Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

