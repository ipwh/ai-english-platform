// ============================================
// PATCH /api/reviews/[id] — 教師覆核提交
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session_token')?.value;
    let userId: string | null = null;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) userId = payload.userId;
    }
    if (!userId) {
      const session = await auth();
      if (session?.user?.id) userId = session.user.id;
    }
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // 更新 submission 的教師覆核
    const updateData: Record<string, unknown> = {};
    if (body.teacherScore !== undefined) updateData.score = body.teacherScore;
    if (body.status !== undefined) {
      updateData.status = body.status === 'reviewed' ? 'graded' : body.status;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await db.submission.update({
      where: { id },
      data: updateData,
    });

    // 記錄到 Review 表
    if (body.teacherFeedback || body.teacherScore !== undefined) {
      const submission = await db.submission.findUnique({
        where: { id },
        select: {
          studentId: true,
          aiFeedback: true,
          score: true,
          answers: true,
          assignment: { select: { title: true, questions: { select: { prompt: true, answer: true } } } },
        },
      });
      if (submission) {
        // 從 submission answers JSON 提取學生答案，從 assignment questions 提取題目
        let questionPrompt = '';
        let studentAnswer = '';
        try {
          const answers = JSON.parse(submission.answers || '{}');
          const qIds = Object.keys(answers);
          if (qIds.length > 0 && submission.assignment?.questions?.length) {
            const firstQ = submission.assignment.questions[0];
            questionPrompt = firstQ.prompt || '';
            studentAnswer = answers[qIds[0]] || '';
          } else if (submission.assignment?.questions?.length) {
            questionPrompt = submission.assignment.questions[0].prompt || '';
          }
        } catch { /* keep defaults */ }

        await db.review.create({
          data: {
            studentId: submission.studentId,
            teacherId: userId,
            teacherScore: body.teacherScore ?? null,
            teacherFeedback: body.teacherFeedback || null,
            status: body.status === 'reviewed' ? 'reviewed' : 'pending',
            questionPrompt,
            studentAnswer,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
