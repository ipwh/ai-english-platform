// ============================================
// API: /api/mistakes — 錯題記錄
// P1: Migrated to MistakeRepo
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { MistakeRepo } from '@/modules/repositories';

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, questionId, studentAnswer, correctAnswer, mistakeType, aiExplanation } = body;

    if (!studentId || !questionId) {
      return NextResponse.json({ error: 'studentId, questionId 為必填' }, { status: 400 });
    }

    // 🔒 Ownership: only allow creating mistakes for yourself (teachers use separate routes)
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號新增錯題' }, { status: 403 });
    }

    const mistake = await MistakeRepo.createMistake({
      studentId,
      questionId,
      studentAnswer: studentAnswer || '',
      correctAnswer: correctAnswer || '',
      mistakeType: mistakeType || 'grammar',
      aiExplanation,
    });

    return NextResponse.json({ mistake }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    // 🔒 Ownership: students can only read their own mistakes
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的錯題' }, { status: 403 });
    }

    const raw = await MistakeRepo.listMistakes(studentId, 100);

    // 依 questionId 去重，保留最新一筆
    const seenQuestionIds = new Set<string>();
    const mistakes = raw.filter(m => {
      if (seenQuestionIds.has(m.questionId)) return false;
      seenQuestionIds.add(m.questionId);
      return true;
    });

    // Map DB fields to frontend MistakeItem shape
    const mapped = mistakes.map((m) => ({
      ...m,
      date: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ mistakes: mapped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'mistakes', error: message }, 'Mistakes GET failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, reviewed, inReviewList } = body;

    if (!id) {
      return NextResponse.json({ error: 'id 為必填' }, { status: 400 });
    }

    // 🔒 Ownership: verify the mistake belongs to this student
    const existing = await MistakeRepo.findMistakeById(id);
    if (!existing) {
      return NextResponse.json({ error: '找不到此錯題' }, { status: 404 });
    }
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && existing.studentId !== authResult.userId) {
      return NextResponse.json({ error: '無權限修改其他用戶的錯題' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof reviewed === 'boolean') updateData.reviewed = reviewed;
    if (typeof inReviewList === 'boolean') updateData.inReviewList = inReviewList;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const mistake = await MistakeRepo.updateMistake(id, updateData);

    // 記錄複習歷史 — uses db directly (MistakeReviewLog has no dedicated repo yet)
    try {
      const action = inReviewList === true ? 'addToReviewList'
        : inReviewList === false ? 'removeFromReviewList'
        : 'reviewed';
      const { db } = await import('@/shared/db/db');
      await db.mistakeReviewLog.create({
        data: {
          mistakeId: id,
          studentId: mistake.studentId,
          action,
          outcome: reviewed ? 'correct' : undefined,
        },
      });
    } catch { /* 歷史記錄非致命 */ }

    return NextResponse.json({ mistake });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 });

    // 🔒 Ownership: verify the mistake belongs to this student
    const existing = await MistakeRepo.findMistakeById(id);
    if (!existing) {
      return NextResponse.json({ error: '找不到此錯題' }, { status: 404 });
    }
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && existing.studentId !== authResult.userId) {
      return NextResponse.json({ error: '無權限刪除其他用戶的錯題' }, { status: 403 });
    }

    await MistakeRepo.deleteMistake(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
