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
  getSpellingSessionById,
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
      return NextResponse.json({ error: 'studentId 為必填 / studentId is required' }, { status: 400 });
    }

    // 🔒 Ownership: students can only generate spelling quizzes for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號生成串字練習 / You can only generate spelling practice for yourself' }, { status: 403 });
    }

    const vocabItems = await getVocabForSpelling(studentId, count, mode, wordIdsParam || undefined);

    if (vocabItems.length === 0) {
      return NextResponse.json({
        words: [],
        message: '你的生字簿還沒有單字，先加入一些吧！ / Your vocabulary book is empty — add some words first!',
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
        // 註：word 會傳給前端作即時顯示；但伺服器批改永遠以資料庫
        // 儲存的生字為準（R3.10-L），客戶端上傳的 word 不可信。
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
        { error: 'sessionId, studentId, attempts[] 為必填 / sessionId, studentId, attempts[] are required' },
        { status: 400 }
      );
    }

    // 🔒 Ownership: students can only submit spelling results for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能提交自己的串字結果 / You can only submit your own spelling results' }, { status: 403 });
    }

    // 🔒 R3.10-L: the session must exist AND belong to the submitting student.
    // Previously the session id was never ownership-checked.
    const session = await getSpellingSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: '找不到串字練習會話 / Spelling session not found' }, { status: 404 });
    }
    if (session.studentId !== studentId) {
      return NextResponse.json({ error: '此串字練習會話不屬於你 / This spelling session does not belong to you' }, { status: 403 });
    }

    // 🔒 2026-08-30 audit (R8): a completed session must not be re-scored.
    // Re-POSTing the same sessionId used to increment mastery/SRS again
    // (mastery +1 per repeat up to 5, interval ×2) — an unbounded farming
    // vector. Return the existing outcome idempotently without re-awarding.
    if (session.status === 'completed') {
      return NextResponse.json({
        sessionId,
        correctCount: session.correctCount,
        totalWords: session.totalWords,
        accuracy: session.totalWords > 0
          ? Math.round((session.correctCount / session.totalWords) * 100)
          : 0,
        records: [],
        alreadyCompleted: true,
      });
    }

    // 記錄每次嘗試
    const records = [];
    let correctCount = 0;
    // 2026-08-29 audit: one attempt per word per submission. Duplicate
    // attempts for the same vocabId would farm mastery 0→5 and double the
    // SRS interval in a single POST.
    const seenVocabIds = new Set<string>();

    for (const attempt of attempts) {
      const { vocabId, studentInput } = attempt;

      if (!vocabId || !studentInput) continue;
      if (seenVocabIds.has(vocabId)) {
        logger.warn({ module: 'spelling', vocabId, studentId }, 'Duplicate spelling attempt for same vocabId skipped');
        continue;
      }
      seenVocabIds.add(vocabId);

      // 🔒 R3.10-L: the correct word comes from the DATABASE (scoped to the
      // session owner), never from the client. Client-supplied `word` is
      // ignored — it cannot force isCorrect or poison mastery/SRS.
      const vocab = await getWordById(vocabId);
      if (!vocab || vocab.studentId !== studentId) {
        logger.warn({ module: 'spelling', vocabId, studentId }, 'Spelling attempt with unresolvable/foreign vocabId skipped');
        continue;
      }

      // 大小寫不敏感比對，但 trim 後比對
      const isCorrect = studentInput.trim().toLowerCase() === vocab.word.trim().toLowerCase();

      if (isCorrect) correctCount++;

      const record = await createSpellingAttempt({
        sessionId, vocabId, word: vocab.word,
        meaningZh: vocab.meaningZh || '', explanationEn: vocab.exampleSentence || null,
        studentInput: studentInput.trim(), isCorrect, attempts: attempt.attemptCount || 1,
      });
      records.push(record);

      // 更新生字的 SRS 資料（資料庫字詞與擁有人已驗證）
      try {
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
      } catch {
        // 非致命：SRS 更新失敗不影響記錄
      }
    }

    // 更新 session 狀態
    await completeSpellingSession(sessionId, correctCount);

    return NextResponse.json({
      sessionId,
      correctCount,
      totalWords: records.length,
      accuracy: records.length > 0 ? Math.round((correctCount / records.length) * 100) : 0,
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
