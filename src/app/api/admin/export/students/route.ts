// ============================================
// GET /api/admin/export/students
// 匯出完整學生資料（含進度、準確率、練習次數）
// 支援 ?academicYear=2025-2026 跨學年查詢
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const academicYear = searchParams.get('academicYear') || '';
    const format = searchParams.get('format') || 'json'; // 'json' | 'csv'

    // ---- 查詢所有學生 ----
    const where: Record<string, unknown> = { role: 'student' };
    if (academicYear) {
      where.academicYear = academicYear;
    }

    const students = await db.user.findMany({
      where: where as any,
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

    // CSV 匯出
    if (format === 'csv') {
      const headers = [
        'studentId', 'email', 'nameZh', 'nameEn', 'level', 'className',
        'classNumber', 'overallAccuracy', 'sessionAccuracy', 'practiceSessions',
        'totalQuestionsAnswered', 'totalCorrectAnswers', 'mistakes', 'vocabItems',
        'submissions', 'academicYear', 'streakDays', 'joinedAt',
      ];
      const csvRows = [headers.join(',')];
      for (const s of enriched) {
        csvRows.push([
          s.studentId, s.email, `"${s.nameZh || ''}"`, `"${s.nameEn || ''}"`,
          s.level, s.className, s.classNumber, s.overallAccuracy ?? '',
          s.sessionAccuracy ?? '', s.practiceSessions, s.totalQuestionsAnswered,
          s.totalCorrectAnswers, s.mistakes, s.vocabItems, s.submissions,
          s.academicYear, s.streakDays, s.joinedAt,
        ].join(','));
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
    console.error('[admin/export/students] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
