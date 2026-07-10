// ============================================
// API: /api/vocabulary — 詞彙庫
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, word, partOfSpeech, meaningZh, exampleSentence, familiarity } = body;

    if (!studentId || !word) {
      return NextResponse.json({ error: 'studentId, word 為必填' }, { status: 400 });
    }

    const vocab = await db.vocabItem.create({
      data: {
        studentId,
        word,
        partOfSpeech: partOfSpeech || 'unknown',
        meaningZh: meaningZh || '',
        exampleSentence,
        familiarity: familiarity || 'new',
      },
    });

    return NextResponse.json({ vocab }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const vocab = await db.vocabItem.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ vocab });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, familiarity } = body;
    if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (familiarity && ['new', 'learning', 'familiar', 'mastered'].includes(familiarity)) {
      updateData.familiarity = familiarity;
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const vocab = await db.vocabItem.update({ where: { id }, data: updateData });
    return NextResponse.json({ vocab });
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

    await db.vocabItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
