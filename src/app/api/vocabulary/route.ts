// ============================================
// API: /api/vocabulary — 詞彙庫
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { serializeVocab } from '@/shared/utils/utils';
import type { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

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

    // 🔒 Ownership: students can only create vocab for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號新增單字' }, { status: 403 });
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

    const data: Prisma.VocabItemCreateInput = {
      student: { connect: { id: studentId } },
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

    const vocab = await db.vocabItem.create({ data });

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
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    // 🔒 Ownership: students can only read their own vocabulary
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的生字簿' }, { status: 403 });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;
    const familiarity = searchParams.get('familiarity');
    const pos = searchParams.get('pos');
    const sort = searchParams.get('sort') || 'recent';
    const search = searchParams.get('search');

    const where: Record<string, unknown> = { studentId };
    if (familiarity && familiarity !== 'all') {
      where.familiarity = familiarity;
    }
    if (pos) {
      where.partOfSpeech = pos;
    }
    if (search) {
      where.word = { contains: search, mode: 'insensitive' };
    }

    const orderBy: Record<string, string> =
      sort === 'alpha' ? { word: 'asc' } :
      sort === 'mastery' ? { masteryLevel: 'desc' } :
      { createdAt: 'desc' };

    const [vocab, total] = await Promise.all([
      db.vocabItem.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      db.vocabItem.count({ where }),
    ]);

    return NextResponse.json({
      vocab: vocab.map(serializeVocab),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load vocabulary';
    console.error('[Vocabulary GET]', err);
    return NextResponse.json({ error: message, vocab: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }, { status: 500 });
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
    const { id, familiarity, masteryLevel, nextReviewDate, reviewInterval, easeFactor, lastReviewedAt } = body;
    if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 });

    // 🔒 Ownership check: verify the vocab item belongs to this student
    const prev = await db.vocabItem.findUnique({ where: { id }, select: { studentId: true, familiarity: true, masteryLevel: true } });
    if (!prev) {
      return NextResponse.json({ error: '找不到此單字' }, { status: 404 });
    }
    if (prev.studentId !== authResult.userId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限修改其他用戶的生字簿' }, { status: 403 });
    }

    const updateData: Prisma.VocabItemUpdateInput = {};
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

    const vocab = await db.vocabItem.update({ where: { id }, data: updateData });

    // 記錄 mastery 變更歷史
    if (prev && (familiarity || masteryLevel !== undefined)) {
      const newFamiliarity = familiarity || prev.familiarity;
      const newMastery = masteryLevel !== undefined ? masteryLevel : prev.masteryLevel;
      if (prev.familiarity !== newFamiliarity || prev.masteryLevel !== newMastery) {
        try {
          await db.vocabMasteryLog.create({
            data: {
              vocabId: id,
              studentId: prev.studentId,
              fromLevel: prev.familiarity,
              toLevel: newFamiliarity,
              fromMastery: prev.masteryLevel,
              toMastery: newMastery,
            },
          });
        } catch { /* 歷史記錄非致命 */ }
      }
    }
    return NextResponse.json({ vocab: serializeVocab(vocab) });
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

    // 🔒 Ownership check: verify the vocab item belongs to this student
    const existing = await db.vocabItem.findUnique({ where: { id }, select: { studentId: true } });
    if (!existing) {
      return NextResponse.json({ error: '找不到此單字' }, { status: 404 });
    }
    if (existing.studentId !== authResult.userId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限刪除其他用戶的生字簿' }, { status: 403 });
    }

    await db.vocabItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
