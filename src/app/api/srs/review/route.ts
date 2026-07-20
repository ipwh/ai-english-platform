// ============================================
// SRS 每日複習 API — 取得待複習卡片 + 提交複習結果
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { getDueCards, calculateNextReview, getDailyReviewTarget, getSrsProgress, familiarityToQuality } from '@/modules/vocabulary/services/srs';

// GET — 取得今日待複習的詞彙 + 錯題
export async function GET(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const type = searchParams.get('type') || 'all';

    if (!studentId) {
      return NextResponse.json({ error: '缺少 studentId' }, { status: 400 });
    }

    const now = new Date();
    let dueVocab: Record<string, unknown>[] = [];
    let dueMistakes: Record<string, unknown>[] = [];

    if (type === 'all' || type === 'vocab') {
      try {
        const allVocab = await db.vocabItem.findMany({
          where: { studentId },
          orderBy: { createdAt: 'desc' },
        });
        dueVocab = allVocab.filter(v =>
          !v.nextReviewDate || new Date(v.nextReviewDate as Date) <= now
        );
      } catch {
        // Fallback without nextReviewDate
        try {
          const allVocab = await db.vocabItem.findMany({
            where: { studentId },
            orderBy: { createdAt: 'desc' },
          });
          dueVocab = allVocab.slice(0, 5); // show first 5 as due
        } catch { /* silently fail */ }
      }
    }

    if (type === 'all' || type === 'mistakes') {
      try {
        const allMistakes = await db.mistake.findMany({
          where: { studentId, inReviewList: true },
          orderBy: { createdAt: 'asc' },
        });
        dueMistakes = allMistakes;
      } catch { /* silently fail */ }
    }

    const vocabCount = dueVocab.length;
    const mistakeCount = dueMistakes.length;
    const totalDue = vocabCount + mistakeCount;

    // Limit to daily target
    const dailyVocabTarget = getDailyReviewTarget(vocabCount);
    const dailyMistakeTarget = getDailyReviewTarget(mistakeCount);

    const limitedVocab = dueVocab.slice(0, dailyVocabTarget);
    const limitedMistakes = dueMistakes.slice(0, dailyMistakeTarget);

    const vocabProgress = getSrsProgress(vocabCount - limitedVocab.length, vocabCount || 1);
    const mistakeProgress = getSrsProgress(mistakeCount - limitedMistakes.length, mistakeCount || 1);

    return NextResponse.json({
      reviewCards: {
        vocab: limitedVocab.map(v => ({
          id: v.id,
          word: v.word,
          partOfSpeech: v.partOfSpeech,
          meaningZh: v.meaningZh,
          exampleSentence: v.exampleSentence,
          familiarity: v.familiarity,
          nextReviewDate: v.nextReviewDate,
        })),
        mistakes: limitedMistakes.map(m => ({
          id: m.id,
          questionId: m.questionId,
          studentAnswer: m.studentAnswer,
          correctAnswer: m.correctAnswer,
          mistakeType: m.mistakeType,
          aiExplanation: m.aiExplanation,
        })),
      },
      progress: {
        vocab: vocabProgress,
        mistakes: mistakeProgress,
        totalDue,
        totalCards: vocabCount + mistakeCount,
      },
    });
  } catch (error) {
    logger.error({ module: 'srs-review', error: error instanceof Error ? error.message : String(error) }, 'SRS Review GET failed');
    return NextResponse.json({ error: '無法載入複習卡片' }, { status: 500 });
  }
}

// POST — 提交複習結果
export async function POST(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { studentId, results } = body as {
      studentId: string;
      results: { type: 'vocab' | 'mistake'; id: string; quality: number }[];
    };

    if (!studentId || !results?.length) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    const updates: Promise<any>[] = [];

    for (const r of results) {
      if (r.type === 'vocab') {
        const vocab = await db.vocabItem.findUnique({ where: { id: r.id } });
        if (!vocab || vocab.studentId !== studentId) continue;

        // 使用 vocab 現有的 SRS 狀態（easeFactor, reviewInterval, lastReviewedAt）
        const quality = r.quality;
        const srsResult = calculateNextReview(quality, {
          easeFactor: vocab.easeFactor ?? 2.5,
          interval: vocab.reviewInterval ?? 0,
          repetitions: 0,
          lastReviewedAt: vocab.lastReviewedAt?.toISOString() ?? vocab.nextReviewDate?.toISOString(),
        });

        // 根據 quality 更新 familiarity
        let newFamiliarity = vocab.familiarity;
        if (quality >= 4 && vocab.familiarity === 'new') newFamiliarity = 'learning';
        else if (quality >= 4 && vocab.familiarity === 'learning') newFamiliarity = 'familiar';
        else if (quality >= 4 && vocab.familiarity === 'familiar') newFamiliarity = 'mastered';
        else if (quality <= 1 && vocab.familiarity === 'mastered') newFamiliarity = 'familiar';
        else if (quality <= 1 && vocab.familiarity === 'familiar') newFamiliarity = 'learning';

        updates.push(
          db.vocabItem.update({
            where: { id: r.id },
            data: {
              familiarity: newFamiliarity,
              nextReviewDate: new Date(srsResult.nextReviewDate),
              reviewInterval: srsResult.interval,
              easeFactor: srsResult.easeFactor,
              lastReviewedAt: new Date(srsResult.lastReviewedAt),
            },
          })
        );
      } else {
        // mistakes — toggle inReviewList based on quality
        if (r.quality <= 2) {
          // keep in review list
          updates.push(Promise.resolve());
        } else {
          updates.push(
            db.mistake.update({
              where: { id: r.id },
              data: { inReviewList: false, reviewed: true },
            })
          );
        }
      }
    }

    await Promise.all(updates);

    return NextResponse.json({ success: true, processed: results.length });
  } catch (error) {
    logger.error({ module: 'srs-review', error: error instanceof Error ? error.message : String(error) }, 'SRS Review POST failed');
    return NextResponse.json({ error: '無法儲存複習結果' }, { status: 500 });
  }
}
