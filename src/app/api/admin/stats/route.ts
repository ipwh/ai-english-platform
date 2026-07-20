// ============================================
// GET /api/admin/stats
// 全校統計數據（供 Recharts 儀表板使用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const academicYear = searchParams.get('academicYear') || '';

    // ---- 各年級平均準確率 ----
    const levelAccuracy = await db.user.groupBy({
      by: ['level'],
      where: {
        role: 'student',
        level: { not: null },
        ...(academicYear ? { academicYear } : {}),
      },
      _avg: { overallAccuracy: true },
      _count: { id: true },
    });

    // ---- 各班級平均準確率 ----
    const classAccuracy = await db.user.groupBy({
      by: ['classId'],
      where: { role: 'student', classId: { not: null } },
      _avg: { overallAccuracy: true },
      _count: { id: true },
    });

    // 取得班級名稱
    const classIds = classAccuracy.map(c => c.classId).filter(Boolean) as string[];
    const classes = await db.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true, name: true, gradeLevel: true },
    });
    const classMap = new Map(classes.map(c => [c.id, c]));

    // ---- 總計統計 ----
    const [totalStudents, totalTeachers, totalAdmins,
      totalSessions, totalMistakes, totalAssignments] = await Promise.all([
      db.user.count({ where: { role: 'student' } }),
      db.user.count({ where: { role: 'teacher' } }),
      db.user.count({ where: { role: 'admin' } }),
      db.practiceSession.count(),
      db.mistake.count(),
      db.assignment.count(),
    ]);

    // ---- 練習趨勢（按月份） ----
    const recentSessions = await db.practiceSession.findMany({
      where: {
        startedAt: {
          gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 最近6個月
        },
      },
      select: { startedAt: true, totalQuestions: true, correctCount: true },
      orderBy: { startedAt: 'asc' },
    });

    // 按月彙總
    const monthlyMap = new Map<string, { sessions: number; questions: number; correct: number }>();
    for (const s of recentSessions) {
      const month = s.startedAt.toISOString().slice(0, 7); // YYYY-MM
      const entry = monthlyMap.get(month) || { sessions: 0, questions: 0, correct: 0 };
      entry.sessions++;
      entry.questions += s.totalQuestions;
      entry.correct += s.correctCount;
      monthlyMap.set(month, entry);
    }

    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        sessions: data.sessions,
        accuracy: data.questions > 0 ? Math.round((data.correct / data.questions) * 100) : 0,
      }));

    // ---- 各年級數據 ----
    const byLevel = levelAccuracy
      .filter(l => l.level)
      .sort((a, b) => (a.level || '').localeCompare(b.level || ''))
      .map(l => ({
        level: l.level,
        studentCount: l._count.id,
        avgAccuracy: l._avg.overallAccuracy ? Math.round(l._avg.overallAccuracy) : 0,
      }));

    // ---- 各班級數據 ----
    const byClass = classAccuracy
      .map(c => {
        const cls = classMap.get(c.classId || '');
        return {
          className: cls?.name || 'Unknown',
          gradeLevel: cls?.gradeLevel || '',
          studentCount: c._count.id,
          avgAccuracy: c._avg.overallAccuracy ? Math.round(c._avg.overallAccuracy) : 0,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    // ---- 準確率分佈 ----
    const allStudents = await db.user.findMany({
      where: { role: 'student', overallAccuracy: { not: null } },
      select: { overallAccuracy: true },
    });

    const distribution = {
      '0-40': 0, '41-55': 0, '56-70': 0, '71-85': 0, '86-100': 0,
    };
    for (const s of allStudents) {
      const acc = s.overallAccuracy || 0;
      if (acc <= 40) distribution['0-40']++;
      else if (acc <= 55) distribution['41-55']++;
      else if (acc <= 70) distribution['56-70']++;
      else if (acc <= 85) distribution['71-85']++;
      else distribution['86-100']++;
    }

    return NextResponse.json({
      overview: {
        totalStudents,
        totalTeachers,
        totalAdmins,
        totalSessions,
        totalMistakes,
        totalAssignments,
      },
      byLevel,
      byClass,
      monthlyTrend,
      accuracyDistribution: Object.entries(distribution).map(([range, count]) => ({
        range,
        count,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'admin-stats', error: msg }, 'Admin stats failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
