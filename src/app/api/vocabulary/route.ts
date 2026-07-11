// ============================================
// API: /api/vocabulary — 詞彙庫
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/** 將 Prisma 回傳的 JSON 字串欄位轉為陣列，確保前端拿到一致的格式 */
function serializeVocab(v: Record<string, unknown>): Record<string, unknown> {
  const result = { ...v };
  for (const field of ['synonyms', 'antonyms', 'collocations', 'allPartOfSpeech']) {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field] as string); } catch { result[field] = []; }
    }
    if (!result[field]) result[field] = [];
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      studentId, word, partOfSpeech, allPartOfSpeech,
      meaningZh, secondaryMeaningZh,
      exampleSentence, exampleZh,
      synonyms, antonyms, collocations,
      familiarity, masteryLevel,
    } = body;

    if (!studentId || !word) {
      return NextResponse.json({ error: 'studentId, word 為必填' }, { status: 400 });
    }

    // 自動去重：檢查是否已存在相同 word + studentId
    const existing = await db.vocabItem.findFirst({
      where: { word: word.trim(), studentId },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'duplicate', vocab: existing, message: '此單字已在生字簿中' },
        { status: 409 }
      );
    }

    const data: Record<string, unknown> = {
      studentId,
      word: word.trim(),
      partOfSpeech: partOfSpeech || 'unknown',
      meaningZh: meaningZh || '',
      familiarity: familiarity || 'new',
      masteryLevel: typeof masteryLevel === 'number' ? masteryLevel : 0,
    };

    // Optional fields — only set if provided
    if (exampleSentence) data.exampleSentence = exampleSentence;
    if (exampleZh) data.exampleZh = exampleZh;
    if (secondaryMeaningZh) data.secondaryMeaningZh = secondaryMeaningZh;
    if (synonyms) data.synonyms = JSON.stringify(synonyms);
    if (antonyms) data.antonyms = JSON.stringify(antonyms);
    if (collocations) data.collocations = JSON.stringify(collocations);
    if (allPartOfSpeech) data.allPartOfSpeech = JSON.stringify(allPartOfSpeech);

    const vocab = await db.vocabItem.create({ data: data as any });

    return NextResponse.json({ vocab: serializeVocab(vocab) }, { status: 201 });
  } catch (err: unknown) {
    // Handle unique constraint violation gracefully
    const message = err instanceof Error ? err.message : '未知錯誤';
    if (message.includes('Unique constraint') || message.includes('UNIQUE')) {
      return NextResponse.json(
        { error: 'duplicate', message: '此單字已在生字簿中' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const vocab = await db.vocabItem.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return NextResponse.json({ vocab: vocab.map(serializeVocab) });
  } catch (err: unknown) {
    console.error('[Vocabulary GET]', err);
    return NextResponse.json({ error: 'Failed to load vocabulary', vocab: [] }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, familiarity, masteryLevel, nextReviewDate, reviewInterval, easeFactor, lastReviewedAt } = body;
    if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (familiarity && ['new', 'learning', 'familiar', 'mastered'].includes(familiarity)) {
      updateData.familiarity = familiarity;
    }
    if (typeof masteryLevel === 'number' && masteryLevel >= 0 && masteryLevel <= 5) {
      updateData.masteryLevel = masteryLevel;
    }
    // SRS 欄位
    if (nextReviewDate) updateData.nextReviewDate = new Date(nextReviewDate);
    if (reviewInterval !== undefined) updateData.reviewInterval = reviewInterval;
    if (easeFactor !== undefined) updateData.easeFactor = easeFactor;
    if (lastReviewedAt) updateData.lastReviewedAt = new Date(lastReviewedAt);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const vocab = await db.vocabItem.update({ where: { id }, data: updateData as any });
    return NextResponse.json({ vocab: serializeVocab(vocab) });
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
