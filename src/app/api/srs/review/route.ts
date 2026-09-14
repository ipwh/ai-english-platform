// ============================================
// SRS 每日複習 API — 取得待複習卡片 + 提交複習結果
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth, verifyStudentSelfAccess } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { calculateNextReview, getDailyReviewTarget, getSrsProgress } from '@/modules/vocabulary/services/srs';
import { getStudentWords, getWordById } from '@/modules/vocabulary/services/vocabulary-service';
import { updateVocab } from '@/modules/student';
import { listDueMistakesForReview, findMistakeById, updateMistake } from '@/modules/student';
import { nextMistakeReviewState } from '@/modules/mistake/db/services/mistake-tracker';

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
      return NextResponse.json({ error: '缺少 studentId / studentId is required' }, { status: 400 });
    }

    // R3.10-K Step 6: never trust client-supplied studentId — students can
    // only read their own review deck (teacher/admin may pass any id).
    const ownership = verifyStudentSelfAccess(authResult, studentId);
    if (ownership) return ownership;

    const now = new Date();
    let dueVocab: Record<string, unknown>[] = [];
    let dueMistakes: Record<string, unknown>[] = [];

    if (type === 'all' || type === 'vocab') {
      try {
        const allVocab = await getStudentWords(studentId);
        dueVocab = allVocab.filter(v =>
          !v.nextReviewDate || new Date(v.nextReviewDate as Date) <= now
        );
      } catch {
        try {
          const allVocab = await getStudentWords(studentId);
          dueVocab = allVocab.slice(0, 5);
        } catch { /* silently fail */ }
      }
    }

    if (type === 'all' || type === 'mistakes') {
      try {
        // 2026-09-14: 只取「到期且可重考」的錯題（剔除閱讀／聆聽 passage 題目）。
        // 舊版把所有錯題當成每日卡片 → 同一批卡片永遠重複，且篇章題無法當 flashcard。
        dueMistakes = await listDueMistakesForReview(studentId, 50);
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
          // 2026-09-14: 卡片正面需要題目文字（舊版只回 studentAnswer，
          // 令複習卡片「正面 = 我的錯答案」）。
          questionSummary: m.questionSummary,
          studentAnswer: m.studentAnswer,
          correctAnswer: m.correctAnswer,
          mistakeType: m.mistakeType,
          languageSkill: m.languageSkill,
          questionType: m.questionType,
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
    return NextResponse.json({ error: '無法載入複習卡片 / Could not load review cards' }, { status: 500 });
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
    // 2026-09-14: 接受兩種 payload：正典 { studentId, results: [...] }，
    // 以及 SRSReviewFlow 早期使用的單卡 { studentId, type, id, quality }。
    // 舊版只認前者，令 UI 逐卡提交一律 400 → 複習結果從未寫入。
    const { studentId, results } = body as {
      studentId: string;
      results?: { type: 'vocab' | 'mistake'; id: string; quality: number }[];
      type?: 'vocab' | 'mistake';
      id?: string;
      quality?: number;
    };
    const normalizedResults = Array.isArray(results) && results.length > 0
      ? results
      : (body?.id && body?.type ? [{ type: body.type, id: body.id, quality: Number(body.quality ?? 0) }] : []);

    if (!studentId || normalizedResults.length === 0) {
      return NextResponse.json({ error: '缺少必要參數 / Missing required parameters' }, { status: 400 });
    }

    // R3.10-K Step 6: students may only mutate their own SRS state.
    const ownership = verifyStudentSelfAccess(authResult, studentId);
    if (ownership) return ownership;

    const updates: Promise<unknown>[] = [];

    for (const r of normalizedResults) {
      if (r.type === 'vocab') {
        const vocab = await getWordById(r.id);
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
          updateVocab(r.id, {
            familiarity: newFamiliarity,
            nextReviewDate: new Date(srsResult.nextReviewDate),
            reviewInterval: srsResult.interval,
            easeFactor: srsResult.easeFactor,
            lastReviewedAt: new Date(srsResult.lastReviewedAt),
          })
        );
      } else {
        // mistakes — 2026-09-14: 依 SM-2 排定下次複習日期（與 PATCH /api/mistakes 共用同一排程）。
        // 舊版只把 reviewed 設 true、從不更新 nextReviewDate → 卡片每日重複、永遠抽不完。
        const existing = await findMistakeById(r.id);
        if (!existing || existing.studentId !== studentId) continue;

        const schedule = nextMistakeReviewState(existing, r.quality, new Date());
        updates.push(
          updateMistake(r.id, {
            reviewed: true,
            inReviewList: false,
            nextReviewDate: schedule.nextReviewDate,
            reviewInterval: schedule.reviewInterval,
            easeFactor: schedule.easeFactor,
            lastReviewedAt: schedule.lastReviewedAt,
          })
        );
      }
    }

    await Promise.allSettled(updates);

    return NextResponse.json({ success: true, processed: normalizedResults.length });
  } catch (error) {
    logger.error({ module: 'srs-review', error: error instanceof Error ? error.message : String(error) }, 'SRS Review POST failed');
    return NextResponse.json({ error: '無法儲存複習結果' }, { status: 500 });
  }
}
