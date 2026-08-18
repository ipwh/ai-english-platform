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
import { findTodaySession, createPracticeSession } from '@/modules/student';
import { createXpTransaction, updateUserXpAndStreak } from '@/modules/student';
import {
  persistGeneratedGrammarQuestions,
  resolveGrammarQuestionDefinitions,
} from '@/modules/exercise/services/grammar-question-service';

const DAILY_CHALLENGE_RATE = { maxRequests: 20, windowMs: 60_000 };

// 每日挑戰題型輪換（已移除 error-correction — 劃線題目無法在前端正確顯示）
const QUESTION_TYPES = ['mc', 'fill-blank'] as const;

// 每日文法主題輪換（30 天循環）
const DAILY_TOPICS = [
  'tenses', 'conditionals', 'passive-voice', 'relative-clauses', 'modals',
  'articles', 'prepositions', 'connectives', 'gerunds-infinitives', 'phrasal-verbs',
  'reported-speech', 'subject-verb-agreement', 'comparatives-superlatives', 'question-forms',
  'negation', 'adjectives-adverbs', 'pronouns', 'quantifiers', 'inversion',
  'participles', 'noun-clauses', 'participle-phrases', 'tenses', 'conditionals',
  'passive-voice', 'modals', 'prepositions', 'articles', 'connectives', 'phrasal-verbs',
];

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
    return NextResponse.json({ error: '只能查看自己的每日挑戰' }, { status: 403 });
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
    const topicIndex = dayOfYear % DAILY_TOPICS.length;
    const grammarItem = DAILY_TOPICS[topicIndex];
    const questionType = QUESTION_TYPES[dayOfYear % QUESTION_TYPES.length];

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
      grammarItemZh: DAILY_TOPICS[topicIndex],
      questionType: questionType as 'mc' | 'fill-blank' | 'short-writing' | 'matching',
      difficulty: 'core',
    });

    const generated = questions[0];
    if (!generated) {
      return NextResponse.json({ error: '未能生成今日挑戰題目，請稍後再試' }, { status: 503 });
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
      return NextResponse.json({ error: '題目伺服器持久化失敗，請稍後再試' }, { status: 500 });
    }

    return NextResponse.json({
      date: today.toISOString().slice(0, 10),
      grammarItem,
      questionType,
      question: { ...generated, id: questionIds[0] },
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
      return NextResponse.json({ error: '只能提交自己的每日挑戰' }, { status: 403 });
    }

    // R3.10-L: server authority — client-supplied isCorrect/correctAnswer
    // are IGNORED; the answer key comes from the persisted question store.
    if (typeof questionId !== 'string' || questionId.trim() === '' || typeof studentAnswer !== 'string') {
      return NextResponse.json({ error: 'questionId 與 studentAnswer 為必填' }, { status: 400 });
    }

    const defs = await resolveGrammarQuestionDefinitions([questionId]);
    const def = defs.get(questionId);
    if (!def) {
      return NextResponse.json({ error: '找不到此題目（伺服器不持有此題，NOT_PROJECTABLE）' }, { status: 400 });
    }

    const normalized = studentAnswer.trim();
    let isCorrect = false;
    if (def.questionType === 'mc' && def.choices && def.choices.length > 0) {
      const letter = normalized.toUpperCase().charAt(0);
      isCorrect = letter === def.answer.trim().toUpperCase().charAt(0);
    } else {
      isCorrect = normalized.toLowerCase() === def.answer.trim().toLowerCase();
    }

    // Check duplicate
    const existing = await findTodaySession(studentId, 'daily-challenge');

    if (existing) {
      return NextResponse.json({ error: 'Already completed today\'s challenge' }, { status: 409 });
    }

    // Save session
    await createPracticeSession({
      studentId,
      skill: grammarItem || 'daily',
      skillZh: '每日挑戰 Daily Challenge',
      difficulty: 'core',
      totalQuestions: 1,
      correctCount: isCorrect ? 1 : 0,
      source: 'daily-challenge',
      completedAt: new Date(),
    });

    // XP: correct answer bonus
    if (isCorrect) {
      const xp = calculateXp({ type: 'answerCorrect', difficulty: 'core' });
      await createXpTransaction({ userId: studentId, event: 'answerCorrect', xpAmount: xp });
    }

    // Sync streak
    const streakDays = await syncUserStreak(studentId);

    return NextResponse.json({
      isCorrect,
      xpAwarded: isCorrect ? calculateXp({ type: 'answerCorrect', difficulty: 'core' }) : 0,
      streakDays,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
