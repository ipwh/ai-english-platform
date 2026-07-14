// ============================================
// API: /api/practice — 練習記錄（僅儲存，XP 由 gamification API 控制）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyApiAuth } from '@/lib/api-auth';

// POST /api/practice — 儲存練習記錄
export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, skill, skillZh, difficulty, totalQuestions, correctCount, source, answers } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId 為必填' }, { status: 400 });
    }

    const session = await db.practiceSession.create({
      data: {
        studentId,
        skill: skill || 'general',
        skillZh: skillZh || '綜合',
        difficulty: difficulty || 'core',
        totalQuestions: totalQuestions || 0,
        correctCount: correctCount || 0,
        source: source || 'ai-generated',
      },
    });

    // 逐題答案儲存（即使 AI/RAG 失敗也要儲存學生答案）
    if (answers && Array.isArray(answers) && answers.length > 0) {
      try {
        await db.practiceAnswer.createMany({
          data: answers.map((a: {
            questionIndex: number; questionType?: string; questionPrompt?: string;
            correctAnswer: string; studentAnswer: string; isCorrect: boolean; timeSpent?: number;
          }, idx: number) => ({
            sessionId: session.id,
            questionIndex: a.questionIndex ?? idx,
            questionType: a.questionType || 'mc',
            questionPrompt: a.questionPrompt || '',
            correctAnswer: a.correctAnswer || '',
            studentAnswer: a.studentAnswer || '',
            isCorrect: a.isCorrect,
            timeSpent: a.timeSpent ?? null,
          })),
        });
      } catch { /* 答案儲存非致命錯誤，session 已儲存 */ }
    }

    // 更新學生整體正確率（從所有練習紀錄計算）
    try {
      const allSessions = await db.practiceSession.findMany({
        where: { studentId },
        select: { totalQuestions: true, correctCount: true },
      });
      const totalQ = allSessions.reduce((s, r) => s + r.totalQuestions, 0);
      const totalC = allSessions.reduce((s, r) => s + r.correctCount, 0);
      if (totalQ > 0) {
        await db.user.update({
          where: { id: studentId },
          data: { overallAccuracy: Math.round((totalC / totalQ) * 100) },
        });
      }
    } catch { /* accuracy update is non-critical */ }

    // 每週進度快照（upsert 本週記錄）
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const weekStart = monday.toISOString().split('T')[0];

      const weekSessions = await db.practiceSession.findMany({
        where: { studentId, startedAt: { gte: monday } },
        select: { totalQuestions: true, correctCount: true },
      });
      const weekTotal = weekSessions.reduce((s, r) => s + r.totalQuestions, 0);
      const weekCorrect = weekSessions.reduce((s, r) => s + r.correctCount, 0);

      await db.weeklySnapshot.upsert({
        where: { userId_weekStart: { userId: studentId, weekStart } },
        create: {
          userId: studentId, weekStart,
          totalQuestions: weekTotal, correctCount: weekCorrect,
          accuracy: weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0,
          sessionsCount: weekSessions.length, xpGained: 0, streakDays: 0, wordsLearned: 0,
        },
        update: {
          totalQuestions: weekTotal, correctCount: weekCorrect,
          accuracy: weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0,
          sessionsCount: weekSessions.length,
        },
      });
    } catch { /* snapshot is non-critical */ }

    return NextResponse.json({ session }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/practice?studentId=...
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

    const sessions = await db.practiceSession.findMany({
      where: { studentId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { answers: { orderBy: { questionIndex: 'asc' } } },
    });

    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    console.error('[Practice GET]', err);
    return NextResponse.json({ error: 'Failed to load practice history', sessions: [] }, { status: 500 });
  }
}
