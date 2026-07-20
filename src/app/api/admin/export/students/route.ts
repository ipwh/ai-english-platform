// ============================================
// GET /api/admin/export/students
// 匯出完整學生資料（含進度、準確率、練習次數）
// 支援 ?academicYear=2025-2026 跨學年查詢
// 支援 ?type=weekly|individual 報告類型
// 支援 ?className=4A 班級篩選
// 教師與管理員均可存取
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { logger } from '@/shared/logger/logger';
import type { Prisma } from '@prisma/client';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';

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
      const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
      if (user && (user.role === 'teacher' || user.role === 'admin')) {
        return { authorized: true, userId: session.user.id };
      }
    }
  } catch { logger.warn({ module: 'admin-export-students' }, 'NextAuth session check failed, falling back to JWT'); }

  return { authorized: false, error: '請先登入教師或管理員帳號' };
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

    const students = await db.user.findMany({
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
        sessions: {
          select: { totalQuestions: true, correctCount: true, startedAt: true },
          orderBy: { startedAt: 'desc' },
          take: 50,
        },
      },
      orderBy: [{ level: 'asc' }, { class: { name: 'asc' } }, { classNumber: 'asc' }],
    });

    // 計算每位學生的練習總次數與總題數
    const enriched = students.map(s => {
      const totalQuestions = s.sessions.reduce((sum, sess) => sum + sess.totalQuestions, 0);
      const totalCorrect = s.sessions.reduce((sum, sess) => sum + sess.correctCount, 0);
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
        overallAccuracy: s.overallAccuracy ? Math.round(s.overallAccuracy) : null,
        sessionAccuracy,
        practiceSessions: s._count.sessions,
        totalQuestionsAnswered: totalQuestions,
        totalCorrectAnswers: totalCorrect,
        mistakes: s._count.mistakes,
        vocabItems: s._count.vocabItems,
        submissions: s._count.submissions,
        academicYear: s.academicYear || s.class?.academicYear || '',
        streakDays: s.streakDays,
        joinedAt: s.joinedAt?.toISOString().split('T')[0] || '',
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
          const accuracies = group.map(s => s.overallAccuracy).filter(a => a != null) as number[];
          const avgAcc = accuracies.length > 0 ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : 0;
          const totalQ = group.reduce((sum, s) => sum + s.totalQuestionsAnswered, 0);
          const totalM = group.reduce((sum, s) => sum + s.mistakes, 0);
          const avgStreak = Math.round(group.reduce((sum, s) => sum + (s.streakDays || 0), 0) / group.length);
          csvRows.push([
            group[0].level || '', `"${group[0].className || ''}"`,
            group.length, avgAcc, totalQ, totalM, avgStreak,
          ].join(','));
        }
      } else {
        // Individual report: per-student detailed data
        const headers = [
          'studentId', 'email', 'nameZh', 'nameEn', 'level', 'className',
          'classNumber', 'overallAccuracy', 'sessionAccuracy', 'practiceSessions',
          'totalQuestionsAnswered', 'totalCorrectAnswers', 'mistakes', 'vocabItems',
          'submissions', 'academicYear', 'streakDays', 'joinedAt',
        ];
        csvRows = [headers.join(',')];
        for (const s of enriched) {
          csvRows.push([
            s.studentId, s.email, `"${s.nameZh || ''}"`, `"${s.nameEn || ''}"`,
            s.level, s.className, s.classNumber, s.overallAccuracy ?? '',
            s.sessionAccuracy ?? '', s.practiceSessions, s.totalQuestionsAnswered,
            s.totalCorrectAnswers, s.mistakes, s.vocabItems, s.submissions,
            s.academicYear, s.streakDays, s.joinedAt,
          ].join(','));
        }
      }
      return new NextResponse(csvRows.join('\n'), {
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
