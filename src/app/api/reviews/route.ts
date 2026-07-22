// ============================================
// GET /api/reviews — 教師覆核列表
// PATCH /api/reviews/[id] — 更新覆核狀態
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const teacherId = authResult.userId!;
  try {

    // 從 Submission 表中提取需要教師覆核的記錄
    const submissions = await db.submission.findMany({
      where: {
        status: { in: ['submitted', 'graded'] },
      },
      select: {
        id: true,
        score: true,
        aiFeedback: true,
        status: true,
        answers: true,
        submittedAt: true,
        student: { select: { id: true, nameZh: true, nameEn: true, class: { select: { name: true } } } },
        assignment: { select: { id: true, title: true, questions: { select: { id: true, prompt: true, answer: true, questionType: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });

    // Also fetch Review records for teacher feedback
    const reviewRecords = await db.review.findMany({
      where: { submissionId: { in: submissions.map(s => s.id) } },
      select: { submissionId: true, teacherScore: true, teacherFeedback: true, status: true },
    });
    const reviewMap = new Map(reviewRecords.map(r => [r.submissionId, r]));

    const reviews = submissions.map(s => {
      // Parse submission answers to extract student answer for display
      let questionPrompt = '';
      let studentAnswer = '';
      let correctAnswer = '';
      let questionType = 'mc';
      const questions = (s.assignment as Record<string, unknown>)?.questions as Array<{ id?: string; prompt?: string; answer?: string; questionType?: string }> || [];
      try {
        const answers = JSON.parse((s as Record<string, unknown>).answers as string || '{}');
        const qIds = Object.keys(answers);
        if (qIds.length > 0) {
          const firstQId = qIds[0];
          studentAnswer = answers[firstQId] || '';
          const matchedQ = questions.find((q) => q.id === firstQId);
          if (matchedQ) {
            questionPrompt = matchedQ.prompt || '';
            correctAnswer = matchedQ.answer || '';
            questionType = matchedQ.questionType || 'mc';
          }
        }
        if (!questionPrompt && questions.length > 0) {
          questionPrompt = questions[0].prompt || '';
          correctAnswer = questions[0].answer || '';
          questionType = questions[0].questionType || 'mc';
        }
      } catch { /* keep defaults */ }

      const reviewRecord = reviewMap.get(s.id);

      return {
        id: s.id,
        studentId: s.student.id,
        studentName: s.student.nameZh,
        studentNameEn: s.student.nameEn,
        className: s.student.class?.name || '',
        assignmentTitle: s.assignment?.title || '',
        questionPrompt,
        studentAnswer,
        correctAnswer,
        questionType,
        aiScore: s.score,
        aiFeedback: s.aiFeedback,
        teacherScore: reviewRecord?.teacherScore ?? null,
        teacherFeedback: reviewRecord?.teacherFeedback ?? null,
        status: s.status,
        submittedAt: s.submittedAt,
      };
    });

    return NextResponse.json({ reviews });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
