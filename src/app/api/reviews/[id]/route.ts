import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// PATCH /api/reviews/[id] — 教師覆核提交
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { notifyFeedbackReady, notifyAssignmentReturned } from '@/shared/utils/notifications';

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

    // 輸入驗證：status 白名單；teacherScore 必須為有限數值（客戶端送字串會令 Prisma Float 失敗）
    const STATUS_WHITELIST = ['reviewed', 'returned', 'graded', 'submitted', 'pending'];
    if (body.status !== undefined && !STATUS_WHITELIST.includes(String(body.status))) {
      return NextResponse.json({ error: 'Invalid status / 無效的狀態' }, { status: 400 });
    }
    if (body.teacherScore !== undefined && body.teacherScore !== null && body.teacherScore !== '') {
      const ts = Number(body.teacherScore);
      if (!Number.isFinite(ts)) {
        return NextResponse.json({ error: 'Invalid teacher score / 無效的教師分數' }, { status: 400 });
      }
      body.teacherScore = ts;
    }

    // 🔒 2026-08-30 audit (Round 4): 教師可覆核「自己派發的作業」或「自己任教班級學生」的提交（admin 豁免）。
    // 舊邏輯只查任教班級，導致組別/跨班作業出現在佇列卻無法覆核。
    if (role !== 'admin') {
      const submissionOwner = await adminDbQuery('submission', 'findUnique', {
        where: { id },
        select: {
          studentId: true,
          student: { select: { classId: true } },
          assignment: { select: { createdBy: true } },
        },
      });
      if (!submissionOwner) {
        return NextResponse.json({ error: 'Forbidden — submission not found' }, { status: 404 });
      }
      const createdByMe = submissionOwner.assignment?.createdBy === userId;
      const ownerClassId = submissionOwner.student?.classId ?? null;
      let teachesClass = false;
      if (ownerClassId) {
        const teaching = await adminDbQuery('teacherClass', 'findFirst', {
          where: { teacherId: userId, classId: ownerClassId },
        });
        teachesClass = !!teaching;
      }
      // 2026-08-30 audit (R5): 混合上課（StudentClass）也視為任教範圍
      if (!teachesClass) {
        const mixedTeaching = await adminDbQuery('studentClass', 'findFirst', {
          where: { studentId: submissionOwner.studentId ?? '', class: { teachers: { some: { teacherId: userId } } } },
        });
        teachesClass = !!mixedTeaching;
      }
      if (!createdByMe && !teachesClass) {
        return NextResponse.json({ error: 'Forbidden — you do not teach this student’s class' }, { status: 403 });
      }
    }

    // 更新 submission 的教師覆核。
    // 教師分數優先：只有當 teacherScore 是有效數值才採用。
    // 2026-08-30 audit (R7): teacherScore=null/'' 不得抹除既有 AI 分數
    // （學生頁顯示「退回後保留上次分數」）；不得把 '' 寫入 Prisma Float（500）。
    // 2026-08-30 audit (R8): 「AI 重新批改」的 aiScore 後備不得覆蓋已被
    // 教師接受的 teacherScore（Review 表已有有限 teacherScore 即保留）。
    const updateData: Record<string, unknown> = {};
    if (typeof body.teacherScore === 'number' && Number.isFinite(body.teacherScore)) {
      updateData.score = body.teacherScore;
    } else if (body.teacherScore === undefined && typeof body.aiScore === 'number' && Number.isFinite(body.aiScore)) {
      const acceptedReview = await adminDbQuery('review', 'findFirst', {
        where: { submissionId: id },
        select: { teacherScore: true },
      }) as { teacherScore: number | null } | null;
      const hasAcceptedTeacherScore =
        acceptedReview !== null &&
        typeof acceptedReview.teacherScore === 'number' &&
        Number.isFinite(acceptedReview.teacherScore);
      if (!hasAcceptedTeacherScore) {
        updateData.score = body.aiScore;
      }
      // 已接受教師分數：保持既有分數，aiScore 僅作為顯示參考不落庫
    }
    // 2026-08-30 audit (R7): teacherFeedback=null 不得抹除既有評語。
    if (typeof body.teacherFeedback === 'string' && body.teacherFeedback.trim() !== '') {
      updateData.teacherFeedback = body.teacherFeedback;
    } else if (typeof body.aiFeedback === 'string' && body.aiFeedback.trim() !== '') {
      updateData.aiFeedback = body.aiFeedback;
    }
    if (typeof body.aiMistakeType === 'string' && body.aiMistakeType.trim() !== '') {
      updateData.aiMistakeType = body.aiMistakeType;
    }
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

    // 🔔 退回重做：無論教師有否填評語均須通知學生（否則學生只能自行重訪才得知）
    if (body.status === 'returned') {
      const returnedSub = await adminDbQuery('submission', 'findUnique', {
        where: { id },
        select: { studentId: true, assignment: { select: { id: true, title: true } } },
      });
      if (returnedSub) {
        await notifyAssignmentReturned(
          returnedSub.studentId,
          returnedSub.assignment?.title || '作業',
          returnedSub.assignment?.id ?? '',
        );
      }
    }

    // 記錄到 Review 表（按 submissionId upsert — 同一次提交只保留一筆教師覆核）。
    // 2026-08-30 audit (R5): 接受批改（reviewed）即使教師未填分數/評語也必須建列 + 通知；
    // 未提供的 teacherScore 不得以 AI 值回填（AI 分數屬 submission.score，不冒充教師分數）。
    if (body.status === 'reviewed' || body.teacherFeedback || body.teacherScore !== undefined) {
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

        const existingReview = await adminDbQuery('review', 'findFirst', {
          where: { submissionId: submission.id },
        }) as { id: string; teacherScore: number | null; status: string | null } | null;

        const reviewData = {
          studentId: submission.studentId,
          teacherId: userId,
          teacherScore: body.teacherScore !== undefined ? body.teacherScore : (existingReview?.teacherScore ?? null),
          teacherFeedback: body.teacherFeedback !== undefined && body.teacherFeedback !== ''
            ? body.teacherFeedback
            : (existingReview ? undefined : null),
          status: body.status === 'reviewed' ? 'reviewed' : (existingReview?.status ?? 'pending'),
          questionPrompt,
          studentAnswer,
        };
        // 已有列且未提供 feedback → 保留原有 feedback
        const updateData: Record<string, unknown> = {
          studentId: reviewData.studentId,
          teacherId: reviewData.teacherId,
          teacherScore: reviewData.teacherScore,
          status: reviewData.status,
          questionPrompt: reviewData.questionPrompt,
          studentAnswer: reviewData.studentAnswer,
        };
        if (reviewData.teacherFeedback !== undefined) updateData.teacherFeedback = reviewData.teacherFeedback;

        if (existingReview) {
          await adminDbQuery('review', 'update', {
            where: { id: existingReview.id },
            data: updateData,
          });
        } else {
          await adminDbQuery('review', 'create', {
            data: { ...updateData, teacherFeedback: reviewData.teacherFeedback ?? null, submissionId: submission.id },
          });
        }

        // 🔔 通知學生：教師已批改（await — 避免 serverless freeze 丟失）
        if (body.status === 'reviewed') {
          await notifyFeedbackReady(
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
