import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET /api/admin/stats
// 全校統計數據（供 Recharts 儀表板使用）
// R3.10-C.2: 每月 scored trend（questions/correct/accuracy）只計
// canonical verified evidence；session 數保持為原始 engagement 計數。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';
import { aggregateVerifiedMonthlyTrend } from '@/modules/exercise/services/practice-evidence-service';

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
    const levelAccuracy = await adminDbQuery('user', 'groupBy', {
      by: ['level'],
      where: {
        role: 'student',
        level: { not: null },
        ...(academicYear ? { academicYear } : {}),
      },
      _avg: { overallAccuracy: true },
      _count: { id: true },
    }) as Array<{level: string | null; _avg: {overallAccuracy: number | null}; _count: {id: number}}>;

    // ---- 各班級平均準確率 ----
    const classAccuracy = await adminDbQuery('user', 'groupBy', {
      by: ['classId'],
      where: { role: 'student', classId: { not: null } },
      _avg: { overallAccuracy: true },
      _count: { id: true },
    }) as Array<{classId: string | null; _avg: {overallAccuracy: number | null}; _count: {id: number}}>;

    // 取得班級名稱
    const classIds = classAccuracy.map(c => c.classId).filter(Boolean) as string[];
    const classes = await adminDbQuery('class', 'findMany', {
      where: { id: { in: classIds } },
      select: { id: true, name: true, gradeLevel: true },
    }) as Array<{id: string; name: string; gradeLevel: string}>;
    const classMap = new Map(classes.map(c => [c.id, c]));

    // ---- 總計統計 ----
    const [totalStudents, totalTeachers, totalAdmins,
      practiceSessionCount, assignmentSubmissionCount, totalMistakes, totalAssignments] = await Promise.all([
      adminDbQuery('user', 'count', { where: { role: 'student' } }),
      adminDbQuery('user', 'count', { where: { role: 'teacher' } }),
      adminDbQuery('user', 'count', { where: { role: 'admin' } }),
      adminDbQuery('practiceSession', 'count', {}),
      adminDbQuery('submission', 'count', { where: { status: { in: ['submitted', 'graded'] }, submittedAt: { not: null } } }),
      adminDbQuery('mistake', 'count', {}),
      adminDbQuery('assignment', 'count', {}),
    ]);
    const totalSessions = practiceSessionCount + assignmentSubmissionCount;

    // ---- 練習趨勢（按月份） ----
    // R3.10-C.2: session 數 = 原始 engagement；questions/correct = verified evidence only。
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const [recentSessions, recentSubmissions] = await Promise.all([
      adminDbQuery('practiceSession', 'findMany', {
        where: { startedAt: { gte: sixMonthsAgo } },
        select: {
          startedAt: true,
          totalQuestions: true,
          correctCount: true,
          answers: {
            select: {
              questionId: true,
              result: true,
              awardedScore: true,
              maxScore: true,
              countsTowardScore: true,
              scoredBy: true,
              scoringMethod: true,
            },
            orderBy: { questionIndex: 'asc' },
          },
        },
        orderBy: { startedAt: 'asc' },
      }) as Promise<Array<{startedAt: Date; totalQuestions: number; correctCount: number; answers: unknown[]}>>,
      adminDbQuery('submission', 'findMany', {
        where: { status: { in: ['submitted', 'graded'] }, submittedAt: { gte: sixMonthsAgo }, score: { not: null } },
        select: { submittedAt: true, score: true, assignment: { select: { questionCount: true } } },
        orderBy: { submittedAt: 'asc' },
      }) as Promise<Array<{submittedAt: Date | null; score: number | null; assignment: {questionCount: number}}>>,
    ]);

    // 按月彙總 — 練習 scored 計數只來自 canonical verified evidence
    const verifiedTrend = aggregateVerifiedMonthlyTrend(recentSessions);
    const monthlyMap = new Map<string, { sessions: number; questions: number; correct: number }>();
    for (const p of verifiedTrend) {
      monthlyMap.set(p.month, { sessions: p.sessions, questions: p.verifiedQuestions, correct: p.verifiedCorrect });
    }
    for (const submission of recentSubmissions) {
      const month = submission.submittedAt!.toISOString().slice(0, 7);
      const entry = monthlyMap.get(month) || { sessions: 0, questions: 0, correct: 0 };
      const totalQuestions = submission.assignment.questionCount;
      entry.sessions++;
      entry.questions += totalQuestions;
      entry.correct += Math.round((submission.score! / 100) * totalQuestions);
      monthlyMap.set(month, entry);
    }

    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        sessions: data.sessions,
        // 2026-09-21：「無資料 ≠ 0」。該月無已驗證題數時為 null（圖表留白、
        // tooltip 顯示「—」），不以 0% 冒充（舊碼令零數據月份看起來像「全錯」）。
        accuracy: data.questions > 0 ? Math.round((data.correct / data.questions) * 100) : null,
      }));

    // ---- 各年級數據 ----
    const byLevel = levelAccuracy
      .filter(l => l.level)
      .sort((a, b) => (a.level || '').localeCompare(b.level || ''))
      .map(l => ({
        level: l.level,
        studentCount: l._count.id,
        // 2026-09-21：`_avg` 已忽略 NULL（無可驗證證據的學生不拉低平均），
        // 但整個年級都無證據時 `_avg` 為 null → 必須回 null 而非 0%，
        // 否則 admin 報表會把「未有數據」顯示成「0%」（紅色）。
        avgAccuracy: l._avg.overallAccuracy != null ? Math.round(l._avg.overallAccuracy) : null,
      }));

    // ---- 各班級數據 ----
    const byClass = classAccuracy
      .map(c => {
        const cls = classMap.get(c.classId || '');
        return {
          className: cls?.name || 'Unknown',
          gradeLevel: cls?.gradeLevel || '',
          studentCount: c._count.id,
          avgAccuracy: c._avg.overallAccuracy != null ? Math.round(c._avg.overallAccuracy) : null,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    // ---- 準確率分佈 ----
    const allStudents = await adminDbQuery('user', 'findMany', {
      where: { role: 'student', overallAccuracy: { not: null } },
      select: { overallAccuracy: true },
    }) as Array<{overallAccuracy: number | null}>;

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
