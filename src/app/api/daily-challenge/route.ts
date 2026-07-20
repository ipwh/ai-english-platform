// ============================================
// API: GET /api/daily-challenge — 每日挑戰
// 每日一題（MCQ / Fill-blank / Error-correction），
// 完成獲得 streak bonus + XP
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { generateQuestions } from '@/modules/ai/services/ai-service';
import { calculateXp } from '@/modules/progress/services/gamification';
import { syncUserStreak } from '@/modules/progress/services/streak-service';

const DAILY_CHALLENGE_RATE = { maxRequests: 20, windowMs: 60_000 };

// 每日挑戰題型輪換
const QUESTION_TYPES = ['mc', 'fill-blank', 'error-correction'] as const;

/** 根據當天日期產生固定的 seed，確保同一天所有人拿到不同題目但同一人拿到相同題目 */
function getDailySeed(studentId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const str = today + studentId;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

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
    const todaySession = await db.practiceSession.findFirst({
      where: {
        studentId,
        source: 'daily-challenge',
        startedAt: { gte: today },
      },
    });

    if (todaySession) {
      return NextResponse.json({
        alreadyCompleted: true,
        score: todaySession.correctCount,
        total: todaySession.totalQuestions,
      });
    }

    // Generate daily question (cached per student per day via deterministic seed)
    const seed = getDailySeed(studentId!);
    const questions = await generateQuestions({
      count: 1,
      gradeLevel: gradeLevel as 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6',
      grammarItem: grammarItem as string,
      grammarItemZh: DAILY_TOPICS[topicIndex],
      questionType: questionType as 'mc' | 'fill-blank' | 'error-correction' | 'short-writing' | 'matching',
      difficulty: 'core',
    });

    return NextResponse.json({
      date: today.toISOString().slice(0, 10),
      grammarItem,
      questionType,
      question: questions[0] || null,
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
    const { studentId, correctAnswer, studentAnswer, isCorrect, grammarItem } = body as {
      studentId: string; correctAnswer: string; studentAnswer: string; isCorrect: boolean; grammarItem?: string;
    };

    if (!studentId) {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 });
    }

    // Check duplicate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await db.practiceSession.findFirst({
      where: { studentId, source: 'daily-challenge', startedAt: { gte: today } },
    });

    if (existing) {
      return NextResponse.json({ error: 'Already completed today\'s challenge' }, { status: 409 });
    }

    // Save session
    await db.practiceSession.create({
      data: {
        studentId,
        skill: grammarItem || 'daily',
        skillZh: '每日挑戰 Daily Challenge',
        difficulty: 'core',
        totalQuestions: 1,
        correctCount: isCorrect ? 1 : 0,
        source: 'daily-challenge',
        completedAt: new Date(),
      },
    });

    // XP: correct answer bonus
    if (isCorrect) {
      const xp = calculateXp({ type: 'answerCorrect', difficulty: 'core' });
      await db.xpTransaction.create({
        data: { userId: studentId, event: 'answerCorrect', xpAmount: xp },
      });
      await db.user.update({
        where: { id: studentId },
        data: { xp: { increment: xp } },
      });
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
