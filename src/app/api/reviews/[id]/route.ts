import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// PATCH /api/reviews/[id] — 教師覆核提交
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { notifyFeedbackReady } from '@/shared/utils/notifications';
import { findSubmissionById, updateSubmission, createReview } from '@/modules/student';

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

    // Sprint 47: Ensure only teachers/admins can submit reviews
    let role: string | null = null;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) role = payload.role;
    }
    if (!role) {
      const session = await auth();
      if (session?.user) role = (session.user as { role?: string }).role ?? null;
    }
    if (role !== 'teacher' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — teacher or admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // 🔒 2026-08-30 audit: 教師只能覆核自己任教班級學生的提交（admin 豁免）
    if (role !== 'admin') {
      const submissionOwner = await adminDbQuery('submission', 'findUnique', {
        where: { id },
        select: { student: { select: { classId: true } } },
      });
      const ownerClassId = submissionOwner?.student?.classId ?? null;
      if (!ownerClassId) {
        return NextResponse.json({ error: 'Forbidden — submission not found' }, { status: 404 });
      }
      const teaching = await adminDbQuery('teacherClass', 'findFirst', {
        where: { teacherId: userId, classId: ownerClassId },
      });
      if (!teaching) {
        return NextResponse.json({ error: 'Forbidden — you do not teach this student’s class' }, { status: 403 });
      }
    }

    // 更新 submission 的教師覆核。
    // 教師分數優先：只有當 teacherScore 未提供時才採用 aiScore（AI 重新批改）。
    const updateData: Record<string, unknown> = {};
    if (body.teacherScore !== undefined) updateData.score = body.teacherScore;
    else if (body.aiScore !== undefined) updateData.score = body.aiScore;
    if (body.aiFeedback !== undefined) updateData.aiFeedback = body.aiFeedback;
    if (body.aiMistakeType !== undefined) updateData.aiMistakeType = body.aiMistakeType;
    if (body.status !== undefined) {
      updateData.status = body.status === 'reviewed' ? 'graded' : body.status;
    }

    // R3.5 hardening: 教師整體覆核標記 — 該提交不得投影為逐題
    // StudentAssessmentResult。不偽造逐題人類評分，不改寫既有
    // AI/server 的 SubmissionAnswer 證據列。
    if (body.teacherScore !== undefined || body.teacherFeedback || body.status === 'reviewed') {
      updateData.humanReviewedAt = new Date();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await adminDbQuery('submission', 'update', {
      where: { id },
      data: updateData,
    });

    // 記錄到 Review 表（按 submissionId upsert — 同一次提交只保留一筆教師覆核）
    if (body.teacherFeedback || body.teacherScore !== undefined) {
      const submission = await adminDbQuery('submission', 'findUnique', {
        where: { id },
        select: {
          id: true,
          studentId: true,
          aiFeedback: true,
          score: true,
          answers: true,
          assignment: { select: { id: true, title: true, questions: { select: { prompt: true, answer: true } } } },
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

        const reviewData = {
          studentId: submission.studentId,
          teacherId: userId,
          teacherScore: body.teacherScore ?? null,
          teacherFeedback: body.teacherFeedback || null,
          status: body.status === 'reviewed' ? 'reviewed' : 'pending',
          questionPrompt,
          studentAnswer,
        };
        const existingReview = await adminDbQuery('review', 'findFirst', {
          where: { submissionId: submission.id },
        });
        if (existingReview) {
          await adminDbQuery('review', 'update', {
            where: { id: existingReview.id },
            data: reviewData,
          });
        } else {
          await adminDbQuery('review', 'create', {
            data: { ...reviewData, submissionId: submission.id },
          });
        }

        // 🔔 通知學生：教師已批改
        if (body.status === 'reviewed' || body.teacherFeedback) {
          notifyFeedbackReady(
            submission.studentId,
            submission.assignment?.title || '作業',
            submission.assignment?.id ?? '',
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
