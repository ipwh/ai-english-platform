// ============================================
// API: GET /api/daily-challenge — 每日挑戰
// 每日一題（MCQ / Fill-blank / Error-correction），
// 完成獲得 streak bonus + XP
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { generateQuestions } from '@/modules/ai';
import { calculateXp } from '@/modules/student/progress/services/gamification';
import { syncUserStreak } from '@/modules/student/progress/services/streak-service';
import { findTodaySession, createPracticeSession, countTodaySessions, deletePracticeSession } from '@/modules/student';
import { createXpTransaction } from '@/modules/student';
import {
  persistGeneratedGrammarQuestions,
  resolveGrammarQuestionDefinitions,
  resolveGrammarQuestionExplanations,
} from '@/modules/exercise/services/grammar-question-service';
import { checkAnswer } from '@/modules/exercise/services/practice-answer-scorer';
import {
  resolveDailyTopic,
  resolveDailyQuestionType,
} from '@/modules/exercise/services/daily-challenge-rotation';

const DAILY_CHALLENGE_RATE = { maxRequests: 20, windowMs: 60_000 };

// GET — 取得今日挑戰題目
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId') || authResult.userId;
  const gradeLevel = searchParams.get('gradeLevel') || 'S4';

  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  }

  // 🔒 Ownership: students can only access their own daily challenge
  if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
    return NextResponse.json({ error: '只能查看自己的每日挑戰 / You can only view your own daily challenge' }, { status: 403 });
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...DAILY_CHALLENGE_RATE, identifier: `daily:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const grammarItem = resolveDailyTopic(dayOfYear);
    // 開放式主題（question-forms 等）的填充題答案不唯一，強制改用 MC
    // 以確保伺服器能以單一答案鍵公平批改。
    const questionType = resolveDailyQuestionType(grammarItem, dayOfYear);

    // Check if already completed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySession = await findTodaySession(studentId, 'daily-challenge');

    if (todaySession) {
      return NextResponse.json({
        alreadyCompleted: true,
        score: todaySession.correctCount,
        total: todaySession.totalQuestions,
      });
    }

    // Generate daily question. R3.10-L: the question is persisted as a
    // server-owned definition BEFORE delivery, and the persisted id is
    // returned — the POST handler scores against that definition only.
    const questions = await generateQuestions({
      count: 1,
      gradeLevel: gradeLevel as 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6',
      grammarItem: grammarItem as string,
      grammarItemZh: grammarItem,
      questionType: questionType as 'mc' | 'fill-blank' | 'short-writing' | 'matching',
      difficulty: 'core',
    });

    const generated = questions[0];
    if (!generated) {
      return NextResponse.json({ error: '未能生成今日挑戰題目，請稍後再試 / Could not generate today\'s challenge question, please try again later' }, { status: 503 });
    }

    // Persistence failure → fail-closed 500 (no client-keyed delivery)
    let questionIds: string[];
    try {
      questionIds = await persistGeneratedGrammarQuestions([{
        questionType: generated.type,
        prompt: generated.prompt,
        promptZh: generated.promptZh ?? null,
        choices: generated.choices && generated.choices.length > 0 ? generated.choices : null,
        answer: generated.answer,
        grammarItem,
        difficulty: 'core',
        gradeLevel,
        explanationZh: generated.explanationZh ?? null,
        explanationEn: generated.explanationEn ?? null,
        provenance: 'daily-challenge',
      }]);
    } catch (persistErr) {
      const persistMsg = persistErr instanceof Error ? persistErr.message : String(persistErr);
      logger.error({ module: 'daily-challenge', error: persistMsg }, 'Daily challenge question persistence failed');
      return NextResponse.json({ error: '題目伺服器持久化失敗，請稍後再試 / Question could not be saved on the server, please try again later' }, { status: 500 });
    }

    // R3.10-L (2026-08-30 audit R8): the answer key and explanations are
    // STRIPPED from the GET payload — a student must not be able to read
    // the correct answer from the response before submitting. The POST
    // handler returns them only AFTER server-side grading.
    const safeQuestion: Record<string, unknown> = { ...generated };
    delete safeQuestion.answer;
    delete safeQuestion.explanationZh;
    delete safeQuestion.explanationEn;

    return NextResponse.json({
      date: today.toISOString().slice(0, 10),
      grammarItem,
      questionType,
      question: { ...safeQuestion, id: questionIds[0] },
      alreadyCompleted: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 提交今日挑戰答案
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, questionId, studentAnswer, grammarItem } = body as {
      studentId: string; questionId?: string; studentAnswer?: string; grammarItem?: string;
    };

    if (!studentId) {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 });
    }

    // 🔒 Ownership: students can only submit their own daily challenge
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能提交自己的每日挑戰 / You can only submit your own daily challenge' }, { status: 403 });
    }

    // R3.10-L: server authority — client-supplied isCorrect/correctAnswer
    // are IGNORED; the answer key comes from the persisted question store.
    if (typeof questionId !== 'string' || questionId.trim() === '' || typeof studentAnswer !== 'string') {
      return NextResponse.json({ error: 'questionId 與 studentAnswer 為必填 / questionId and studentAnswer are required' }, { status: 400 });
    }

    const defs = await resolveGrammarQuestionDefinitions([questionId]);
    const def = defs.get(questionId);
    if (!def) {
      return NextResponse.json({ error: '找不到此題目（伺服器不持有此題，NOT_PROJECTABLE） / Question not found on the server (NOT_PROJECTABLE)' }, { status: 400 });
    }

    // 與 /api/practice 使用相同的正典 scorer（checkAnswer）：對填充題做
    // 正規化 + 部分匹配，並在定義存在時納入 acceptedAnswers —— 不再以單一
    // 答案字串做嚴格全等比對（同義/格式差異會被誤判為錯）。
    let isCorrect = checkAnswer(
      studentAnswer,
      def.answer,
      def.questionType,
      def.choices ?? undefined,
    );
    if (!isCorrect && def.acceptedAnswers && def.acceptedAnswers.length > 0) {
      isCorrect = def.acceptedAnswers.some(acc =>
        checkAnswer(studentAnswer, acc, def.questionType, def.choices ?? undefined),
      );
    }

    // Check duplicate
    const existing = await findTodaySession(studentId, 'daily-challenge');

    if (existing) {
      return NextResponse.json({ error: 'Already completed today\'s challenge' }, { status: 409 });
    }

    // Save session
    const created = await createPracticeSession({
      studentId,
      skill: grammarItem || 'daily',
      skillZh: '每日挑戰 Daily Challenge',
      difficulty: 'core',
      totalQuestions: 1,
      correctCount: isCorrect ? 1 : 0,
      source: 'daily-challenge',
      completedAt: new Date(),
    });

    // 2026-08-30 audit (R8): find-then-create is not atomic — two concurrent
    // POSTs can both pass the duplicate check above. Re-count after creation
    // and roll back the loser BEFORE any XP is awarded (deterministic rewards
    // must never double-award).
    const todayCount = await countTodaySessions(studentId, 'daily-challenge');
    if (todayCount > 1) {
      try {
        await deletePracticeSession(created.id);
      } catch { /* rollback is best-effort; no XP has been awarded */ }
      return NextResponse.json({ error: "Already completed today's challenge" }, { status: 409 });
    }

    // XP: correct answer bonus
    if (isCorrect) {
      const xp = calculateXp({ type: 'answerCorrect', difficulty: 'core' });
      await createXpTransaction({ userId: studentId, event: 'answerCorrect', xpAmount: xp });
    }

    // Sync streak
    const streakDays = await syncUserStreak(studentId);

    // R3.10-L (R8): the correct answer + explanation are returned ONLY in the
    // graded POST response — never before submission.
    const explanations = await resolveGrammarQuestionExplanations(questionId);

    return NextResponse.json({
      isCorrect,
      xpAwarded: isCorrect ? calculateXp({ type: 'answerCorrect', difficulty: 'core' }) : 0,
      streakDays,
      correctAnswer: def.answer,
      explanationZh: explanations?.explanationZh ?? undefined,
      explanationEn: explanations?.explanationEn ?? undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
