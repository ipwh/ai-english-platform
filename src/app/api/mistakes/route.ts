// ============================================
// API: /api/mistakes — 錯題記錄
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, questionId, studentAnswer, correctAnswer, mistakeType, aiExplanation } = body;

    if (!studentId || !questionId) {
      return NextResponse.json({ error: 'studentId, questionId 為必填' }, { status: 400 });
    }

    const mistake = await db.mistake.create({
      data: {
        studentId,
        questionId,
        studentAnswer: studentAnswer || '',
        correctAnswer: correctAnswer || '',
        mistakeType: mistakeType || 'grammar',
        aiExplanation,
      },
    });

    return NextResponse.json({ mistake }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const mistakes = await db.mistake.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ mistakes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[Mistakes GET]', message);
    return NextResponse.json({ error: message, mistakes: [] }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, reviewed, inReviewList } = body;

    if (!id) {
      return NextResponse.json({ error: 'id 為必填' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof reviewed === 'boolean') updateData.reviewed = reviewed;
    if (typeof inReviewList === 'boolean') updateData.inReviewList = inReviewList;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const mistake = await db.mistake.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ mistake });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 });

    await db.mistake.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
