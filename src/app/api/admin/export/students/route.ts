import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET /api/admin/export/students
// 匯出完整學生資料（含進度、準確率、練習次數）
// R3.10-C.2: scored 欄位（overallAccuracy / sessionAccuracy /
// totalQuestionsAnswered / totalCorrectAnswers）只含 verified evidence；
// 原始歷史值以 recordedTotalQuestions / recordedCorrectCount 明確標記。
//
// 2026-09-21 稽核修正（兩項資料正確性缺陷）：
// 1. **移除「最新 50 場」窗**：舊碼以 sessions 的 nested select 加 50 筆上限
//    交給聚合函式，令 `totalQuestionsAnswered / totalCorrectAnswers /
//    sessionAccuracy` 在欄名標示「總數」的情況下只算最新 50 場
//    （高練習量學生被低估）。現改由正典批次投影
//    `aggregateVerifiedTotalsForStudents()`（全歷史分頁，無上限）。
// 2. **連續天數改讀正典口徑**：舊碼平均 `User.streakDays` 快取（只在學生載入
//    dashboard 時寫入）→ 未載入者為 0、數值可能過期。現由
//    `getPracticeStreaksForStudents()`（與學生端同一個 `countStreak`）計算。
// 3. `joinedAt` 改用香港日 key（原本 `toISOString().split('T')[0]` 為 UTC 日）。
// 4. `overallAccuracy` 與 `sessionAccuracy` 皆為**空值安全**，且兩者口徑相同
//    （前者讀平台聚合快取、後者由逐題證據重算，正常應相等；
//    無可驗證證據時兩者皆為空，**永不**顯示 0%）。
//
// 存取權限（依用戶決定，刻意維持）：admin 與教師皆可用，且**不**依任教班級
// 收窄範圍（教師可匯出全校學生）。勿在未經指示下「順手」加上班級過濾。
//
// 支援 ?academicYear=2026-2027 跨學年查詢
// 支援 ?type=weekly|individual 報告類型
// 支援 ?className=4A 班級篩選
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { logger } from '@/shared/logger/logger';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { aggregateVerifiedTotalsForStudents } from '@/modules/exercise/services/practice-history-service';
import { getPracticeStreaksForStudents } from '@/modules/student/progress/services/streak-service';
import { hkDayKey } from '@/shared/utils/hk-date';

async function verifyTeacherOrAdmin(request: NextRequest): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  // Try admin first
  const adminResult = await verifyAdmin(request);
  if (adminResult.authorized) return adminResult;

  // Try teacher via JWT
  const jwtToken = request.cookies.get('session_token')?.value || '';
  if (jwtToken) {
    const payload = await verifySessionToken(jwtToken);
    if (payload && (payload.role === 'teacher' || payload.role === 'admin')) {
      return { authorized: true, userId: payload.userId };
    }
  }

  // Try teacher via NextAuth
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await adminDbQuery('user', 'findUnique', { where: { id: session.user.id }, select: { role: true } }) as {role: string} | null;
      if (user && (user.role === 'teacher' || user.role === 'admin')) {
        return { authorized: true, userId: session.user.id };
      }
    }
  } catch { logger.warn({ module: 'admin-export-students' }, 'NextAuth session check failed, falling back to JWT'); }

  return { authorized: false, error: '請先登入教師或管理員帳號 / Please sign in with a teacher or admin account' };
}

export async function GET(request: NextRequest) {
  try {
    // ---- 認證：admin 或 teacher ----
    const authResult = await verifyTeacherOrAdmin(request);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const academicYear = searchParams.get('academicYear') || '';
    const format = searchParams.get('format') || 'json';
    const reportType = searchParams.get('type') || 'individual';
    const className = searchParams.get('className') || '';

    // ---- 查詢所有學生 ----
    const where: Prisma.UserWhereInput = { role: 'student' };
    if (academicYear) where.academicYear = academicYear;
    if (className) where.class = { name: className };

    type StudentExportRow = {
      id: string; email: string; nameZh: string | null; nameEn: string | null;
      level: string | null; classNumber: number | null;
      class: {name: string; gradeLevel: string; academicYear: string | null} | null;
      overallAccuracy: number | null; streakDays: number;
      academicYear: string | null; joinedAt: Date | null;
      _count: {sessions: number; mistakes: number; vocabItems: number; submissions: number};
    };

    const students = await adminDbQuery('user', 'findMany', {
      where,
      select: {
        id: true,
        email: true,
        nameZh: true,
        nameEn: true,
        level: true,
        overallAccuracy: true,
        streakDays: true,
        academicYear: true,
        joinedAt: true,
        class: { select: { name: true, gradeLevel: true, academicYear: true } },
        classNumber: true,
        _count: { select: { sessions: true, mistakes: true, vocabItems: true, submissions: true } },
      },
      orderBy: [{ level: 'asc' }, { class: { name: 'asc' } }, { classNumber: 'asc' }],
    }) as StudentExportRow[];

    // 2026-09-21 稽核：全歷史批次投影（不設 take 上限）＋正典連續天數。
    const studentIds = students.map(s => s.id);
    const gradedSubmissionWhere = {
      studentId: { in: studentIds },
      status: { in: ['submitted', 'graded'] },
      submittedAt: { not: null },
      score: { not: null },
    } as const;
    const [practiceTotalsByStudent, streakByStudent, gradedSubmissions] = await Promise.all([
      aggregateVerifiedTotalsForStudents(studentIds),
      getPracticeStreaksForStudents(studentIds),
      adminDbQuery('submission', 'findMany', {
        where: gradedSubmissionWhere,
        select: { studentId: true, score: true, assignment: { select: { questionCount: true } } },
      }) as Promise<Array<{ studentId: string; score: number | null; assignment: { questionCount: number } }>>,
    ]);

    // 已評分作業的逐生累加（伺服器權威分數 → 題數）
    const assignmentByStudent = new Map<string, { questions: number; correct: number; count: number }>();
    for (const submission of gradedSubmissions) {
      const entry = assignmentByStudent.get(submission.studentId) ?? { questions: 0, correct: 0, count: 0 };
      const questionCount = submission.assignment.questionCount;
      entry.questions += questionCount;
      entry.correct += Math.round(((submission.score ?? 0) / 100) * questionCount);
      entry.count += 1;
      assignmentByStudent.set(submission.studentId, entry);
    }

    // 計算每位學生的練習總次數與總題數
    // R3.10-C.2: scored 總數只含 verified row-derived evidence；
    // 原始歷史值保留為 recordedTotalQuestions / recordedCorrectCount。
    const enriched = students.map(s => {
      const assignment = assignmentByStudent.get(s.id) ?? { questions: 0, correct: 0, count: 0 };
      const practiceTotals = practiceTotalsByStudent.get(s.id) ?? {
        verifiedTotalQuestions: 0,
        verifiedCorrectCount: 0,
        accuracy: null,
        recordedTotalQuestions: 0,
        recordedCorrectCount: 0,
        sessionsCount: 0,
      };
      const totalQuestions = practiceTotals.verifiedTotalQuestions + assignment.questions;
      const totalCorrect = practiceTotals.verifiedCorrectCount + assignment.correct;
      // 無任何可驗證證據 ⇒ null（「無資料」≠ 0%）
      const sessionAccuracy = totalQuestions > 0
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : null;

      return {
        studentId: s.id,
        email: s.email,
        nameZh: s.nameZh,
        nameEn: s.nameEn,
        level: s.level,
        className: s.class?.name || '',
        classNumber: s.classNumber,
        // 平台聚合快取（空值安全；`0` 為真實 0%，無證據為 null）
        overallAccuracy: s.overallAccuracy != null ? Math.round(s.overallAccuracy) : null,
        // 由逐題證據重算的同一口徑（正常應等於 overallAccuracy；供交叉核對）
        sessionAccuracy,
        // 2026-09-21 稽核：練習場次與作業提交數分開呈現（舊碼相加後語意不清）
        practiceSessions: practiceTotals.sessionsCount,
        assignmentSubmissions: assignment.count,
        totalQuestionsAnswered: totalQuestions,
        totalCorrectAnswers: totalCorrect,
        verifiedTotalQuestions: practiceTotals.verifiedTotalQuestions,
        verifiedCorrectCount: practiceTotals.verifiedCorrectCount,
        recordedTotalQuestions: practiceTotals.recordedTotalQuestions,
        recordedCorrectCount: practiceTotals.recordedCorrectCount,
        mistakes: s._count.mistakes,
        vocabItems: s._count.vocabItems,
        submissions: s._count.submissions,
        academicYear: s.academicYear || s.class?.academicYear || '',
        // 正典連續天數（與學生端同源；不再平均快取欄位）
        streakDays: streakByStudent.get(s.id) ?? 0,
        // 香港日 key（舊碼為 UTC 日）
        joinedAt: s.joinedAt ? hkDayKey(s.joinedAt) : '',
      };
    });

    // CSV 匯出 — 根據類型區分格式
    if (format === 'csv') {
      let csvRows: string[];
      if (reportType === 'weekly') {
        // Weekly report: aggregated class/level summary
        const headers = ['年級', '班級', '學生數', '平均準確率 (%)', '總練習題數', '總錯題數', '平均連續天數'];
        csvRows = [headers.join(',')];
        // Group by class
        const classGroups = new Map<string, typeof enriched>();
        for (const s of enriched) {
          const key = `${s.level || 'N/A'}_${s.className || 'N/A'}`;
          if (!classGroups.has(key)) classGroups.set(key, []);
          classGroups.get(key)!.push(s);
        }
        for (const [, group] of classGroups) {
          // 2026-09-21 稽核：平均準確率只取「有可驗證證據」的學生；
          // 全班皆無證據時輸出空值（不是 0），避免報表顯示假 0%。
          const accuracies = group
            .map(s => s.sessionAccuracy)
            .filter((a): a is number => a != null);
          const avgAcc = accuracies.length > 0
            ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
            : '';
          const withStreak = group.filter(s => s.streakDays > 0);
          const avgStreak = withStreak.length > 0
            ? Math.round(withStreak.reduce((sum, s) => sum + s.streakDays, 0) / withStreak.length)
            : 0;
          const totalQ = group.reduce((sum, s) => sum + s.totalQuestionsAnswered, 0);
          const totalM = group.reduce((sum, s) => sum + s.mistakes, 0);
          csvRows.push([
            group[0].level || '', `"${group[0].className || ''}"`,
            group.length, avgAcc, totalQ, totalM, avgStreak,
          ].join(','));
        }
      } else {
        // Individual report: per-student detailed data
        // scored 欄位為 verified-based；原始歷史值以 recorded* 欄位明確標記。
        // 注意：`overallAccuracy` / `sessionAccuracy` 口徑相同（前者讀平台聚合
        // 快取、後者由逐題證據重算）；兩欄並列是為了讓快取漂移可被發現。
        // `practiceSessions`（練習場次）與 `assignmentSubmissions`（已評分作業）
        // 刻意分開，不再相加。所有 scored 欄位皆為空值安全（無證據 = 空，非 0）。
        const headers = [
          'studentId', 'email', 'nameZh', 'nameEn', 'level', 'className',
          'classNumber', 'overallAccuracy', 'sessionAccuracy', 'practiceSessions',
          'assignmentSubmissions',
          'totalQuestionsAnswered', 'totalCorrectAnswers',
          'recordedTotalQuestions', 'recordedCorrectCount',
          'verifiedTotalQuestions', 'verifiedCorrectCount',
          'mistakes', 'vocabItems',
          'submissions', 'academicYear', 'streakDays', 'joinedAt',
        ];
        csvRows = [headers.join(',')];
        for (const s of enriched) {
          csvRows.push([
            s.studentId, s.email, `"${s.nameZh || ''}"`, `"${s.nameEn || ''}"`,
            s.level, s.className, s.classNumber, s.overallAccuracy ?? '',
            s.sessionAccuracy ?? '', s.practiceSessions, s.assignmentSubmissions,
            s.totalQuestionsAnswered,
            s.totalCorrectAnswers, s.recordedTotalQuestions, s.recordedCorrectCount,
            s.verifiedTotalQuestions, s.verifiedCorrectCount,
            s.mistakes, s.vocabItems, s.submissions,
            s.academicYear, s.streakDays, s.joinedAt,
          ].join(','));
        }
      }
      return new NextResponse('\uFEFF' + csvRows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="students_export_${academicYear || 'all'}.csv"`,
        },
      });
    }

    return NextResponse.json({ students: enriched, total: enriched.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'admin-export-students', error: msg }, 'Export students failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
