// ============================================
// API: /api/vocabulary/spelling
// GET  - 從生字簿生成串字練習題目
// POST - 提交串字答案 & 記錄結果
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyApiAuth } from '@/lib/api-auth';
import { serializeVocab } from '@/lib/utils';

// ============================================
// GET: 生成串字練習題目
// ============================================
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const count = Math.min(Math.max(1, parseInt(searchParams.get('count') || '10')), 30);
    const mode = searchParams.get('mode') || 'new'; // new | random | weakest | due
    const wordIdsParam = searchParams.get('wordIds'); // comma-separated vocab IDs for custom selection

    if (!studentId) {
      return NextResponse.json({ error: 'studentId 為必填' }, { status: 400 });
    }

    // 根據模式選取生字
    let orderBy: Record<string, string>;
    let whereExtra: Record<string, unknown> = {};

    switch (mode) {
      case 'weakest':
        orderBy = { masteryLevel: 'asc' };
        break;
      case 'new':
        orderBy = { createdAt: 'desc' };
        break;
      case 'due':
        orderBy = { masteryLevel: 'asc' };
        whereExtra = { nextReviewDate: { lte: new Date() } };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // 自選單字模式：wordIds 優先
    if (wordIdsParam) {
      const ids = wordIdsParam.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 0) {
        whereExtra = { id: { in: ids } };
      }
    }

    let vocabItems = await db.vocabItem.findMany({
      where: { studentId, ...whereExtra },
      orderBy,
      take: wordIdsParam ? (wordIdsParam.split(',').length || 30) : (mode === 'random' ? 100 : count * 2),
    });

    // random 模式：隨機打亂後取前 count 個（wordIds 模式則保持原順序）
    if (mode === 'random' && !wordIdsParam) {
      vocabItems = vocabItems.sort(() => Math.random() - 0.5).slice(0, count);
    } else {
      vocabItems = vocabItems.slice(0, count);
    }

    if (vocabItems.length === 0) {
      return NextResponse.json({
        words: [],
        message: '你的生字簿還沒有單字，先加入一些吧！',
      });
    }

    // 建立新的串字練習 session
    const session = await db.spellingSession.create({
      data: {
        studentId,
        totalWords: vocabItems.length,
        correctCount: 0,
        status: 'in-progress',
      },
    });

    const words = vocabItems.map((v) => {
      const deserialized = serializeVocab(v);
      return {
        vocabId: v.id,
        word: v.word,
        meaningZh: v.meaningZh,
        partOfSpeech: v.partOfSpeech,
        explanationEn: deserialized.exampleSentence || undefined,
        // 不傳送完整單字給前端（避免作弊），但保留 vocabId 用於提交
        // 前端的 SpellingPractice 會使用這些欄位
      };
    });

    return NextResponse.json({
      sessionId: session.id,
      words,
      total: words.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate spelling quiz';
    console.error('[Spelling GET]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================
// POST: 提交串字答案 + 記錄
// ============================================
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { sessionId, studentId, attempts } = body;

    if (!sessionId || !studentId || !Array.isArray(attempts)) {
      return NextResponse.json(
        { error: 'sessionId, studentId, attempts[] 為必填' },
        { status: 400 }
      );
    }

    // 記錄每次嘗試
    const records = [];
    let correctCount = 0;

    for (const attempt of attempts) {
      const { vocabId, word, meaningZh, explanationEn, studentInput } = attempt;

      if (!word || !studentInput) continue;

      // 大小寫不敏感比對，但 trim 後比對
      const isCorrect = studentInput.trim().toLowerCase() === word.trim().toLowerCase();

      if (isCorrect) correctCount++;

      const record = await db.spellingAttempt.create({
        data: {
          sessionId,
          vocabId: vocabId || null,
          word: word.trim(),
          meaningZh: meaningZh || '',
          explanationEn: explanationEn || null,
          studentInput: studentInput.trim(),
          isCorrect,
          attempts: attempt.attemptCount || 1,
        },
      });
      records.push(record);

      // 更新生字的 SRS 資料
      if (vocabId) {
        try {
          const vocab = await db.vocabItem.findUnique({ where: { id: vocabId } });
          if (vocab) {
            const newMastery = isCorrect
              ? Math.min(5, (vocab.masteryLevel ?? 0) + 1)
              : Math.max(0, (vocab.masteryLevel ?? 0) - 1);
            const newInterval = isCorrect
              ? Math.max(1, (vocab.reviewInterval ?? 0) * 2)
              : 1;
            const nextReview = new Date();
            nextReview.setDate(nextReview.getDate() + newInterval);

            await db.vocabItem.update({
              where: { id: vocabId },
              data: {
                masteryLevel: newMastery,
                reviewInterval: newInterval,
                nextReviewDate: nextReview,
                lastReviewedAt: new Date(),
                familiarity:
                  newMastery >= 5 ? 'mastered'
                  : newMastery >= 3 ? 'familiar'
                  : newMastery >= 1 ? 'learning'
                  : 'new',
              },
            });
          }
        } catch {
          // 非致命：SRS 更新失敗不影響記錄
        }
      }
    }

    // 更新 session 狀態
    await db.spellingSession.update({
      where: { id: sessionId },
      data: {
        correctCount,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      sessionId,
      correctCount,
      totalWords: attempts.length,
      accuracy: attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0,
      records: records.map((r) => ({
        word: r.word,
        studentInput: r.studentInput,
        isCorrect: r.isCorrect,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit spelling';
    console.error('[Spelling POST]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
