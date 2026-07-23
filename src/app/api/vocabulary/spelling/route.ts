// ============================================
// API: /api/vocabulary/spelling
// GET  - 從生字簿生成串字練習題目
// POST - 提交串字答案 & 記錄結果
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { serializeVocab } from '@/shared/utils/utils';
import {
  getVocabForSpelling,
  createSpellingSession,
  getWordById,
  createSpellingAttempt,
  updateVocabSRS,
  completeSpellingSession,
} from '@/modules/vocabulary/services/vocabulary-service';

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

    // 🔒 Ownership: students can only generate spelling quizzes for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號生成串字練習' }, { status: 403 });
    }

    const vocabItems = await getVocabForSpelling(studentId, count, mode, wordIdsParam || undefined);

    if (vocabItems.length === 0) {
      return NextResponse.json({
        words: [],
        message: '你的生字簿還沒有單字，先加入一些吧！',
      });
    }

    const session = await createSpellingSession(studentId, vocabItems.length);

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
    logger.error({ module: 'spelling', error: err instanceof Error ? err.message : String(err) }, 'Spelling GET failed');
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

    // 🔒 Ownership: students can only submit spelling results for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能提交自己的串字結果' }, { status: 403 });
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

      const record = await createSpellingAttempt({
        sessionId, vocabId: vocabId || null, word: word.trim(),
        meaningZh: meaningZh || '', explanationEn: explanationEn || null,
        studentInput: studentInput.trim(), isCorrect, attempts: attempt.attemptCount || 1,
      });
      records.push(record);

      // 更新生字的 SRS 資料
      if (vocabId) {
        try {
          const vocab = await getWordById(vocabId);
          if (vocab) {
            const newMastery = isCorrect
              ? Math.min(5, (vocab.masteryLevel ?? 0) + 1)
              : Math.max(0, (vocab.masteryLevel ?? 0) - 1);
            const newInterval = isCorrect
              ? Math.max(1, (vocab.reviewInterval ?? 0) * 2)
              : 1;
            const nextReview = new Date();
            nextReview.setDate(nextReview.getDate() + newInterval);

            await updateVocabSRS(vocabId, {
              masteryLevel: newMastery, reviewInterval: newInterval,
              nextReviewDate: nextReview, lastReviewedAt: new Date(),
              familiarity: newMastery >= 5 ? 'mastered' : newMastery >= 3 ? 'familiar' : newMastery >= 1 ? 'learning' : 'new',
            });
          }
        } catch {
          // 非致命：SRS 更新失敗不影響記錄
        }
      }
    }

    // 更新 session 狀態
    await completeSpellingSession(sessionId, correctCount);

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
    logger.error({ module: 'spelling', error: err instanceof Error ? err.message : String(err) }, 'Spelling POST failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
