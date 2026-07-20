// ============================================
// API: /api/practice — 練習記錄（僅儲存，XP 由 gamification API 控制）
// P1: Migrated to PracticeRepo + MistakeRepo
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { PracticeRepo, MistakeRepo } from '@/modules/repositories';
import { recordActivityMastery, syncStudentActivityMetrics } from '@/modules/learning-analytics/services/activity-accounting-service';

const PRACTICE_RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

// POST /api/practice — 儲存練習記錄
export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // 🔒 Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...PRACTICE_RATE_LIMIT, identifier: `practice:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await request.json();
    const { studentId, skill, skillZh, difficulty, totalQuestions, correctCount, source, answers } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId 為必填' }, { status: 400 });
    }

    // 🔒 Ownership check: only the student themselves or a teacher can write practice data
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限為其他用戶儲存練習記錄' }, { status: 403 });
    }

    const session = await PracticeRepo.createPracticeSession({
      studentId,
      skill: skill || 'general',
      skillZh: skillZh || '綜合',
      difficulty: difficulty || 'core',
      totalQuestions: totalQuestions || 0,
      correctCount: correctCount || 0,
      source: source || 'ai-generated',
      completedAt: new Date(),
    });

    // 逐題答案儲存（即使 AI/RAG 失敗也要儲存學生答案）
    if (answers && Array.isArray(answers) && answers.length > 0) {
      try {
        await PracticeRepo.createPracticeAnswers(session.id, answers);
      } catch { /* 答案儲存非致命錯誤，session 已儲存 */ }

      // === Auto-mistake sync: 錯誤答案自動記錄到錯題本 ===
      try {
        const wrongAnswers = answers.filter((a: { isCorrect: boolean }) => !a.isCorrect);
        for (const a of wrongAnswers) {
          const qId = `${session.id}-q${a.questionIndex}`;
          const existing = await MistakeRepo.findMistakeByQuestion(studentId, qId);
          if (!existing) {
            await MistakeRepo.createMistake({
              studentId,
              questionId: qId,
              questionSummary: (a as { questionPrompt?: string }).questionPrompt || '',
              studentAnswer: a.studentAnswer || '',
              correctAnswer: a.correctAnswer || '',
              mistakeType: 'grammar',
            });
          }
        }
      } catch { /* mistake sync non-critical */ }
    }

    // 同步所有衍生數據：整體正確率、週統計及掌握度。
    // 服務同時涵蓋教師任務提交，避免兩種活動出現不同口徑。
    try {
      await Promise.all([
        syncStudentActivityMetrics(studentId),
        recordActivityMastery({
          studentId,
          skill,
          subSkill: skillZh || skill || 'general',
          totalQuestions: totalQuestions || 0,
          correctCount: correctCount || 0,
        }),
      ]);
    } catch (error) {
      logger.error({ module: 'practice', studentId, error: error instanceof Error ? error.message : String(error) }, 'Practice analytics sync failed');
    }

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

    // 🔒 Ownership check: only the student themselves or a teacher/admin can read practice history
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限查看其他用戶的練習記錄', sessions: [] }, { status: 403 });
    }

    const [sessions, submissions] = await Promise.all([
      PracticeRepo.listPracticeSessions(studentId, 50),
      (await import('@/shared/db/db')).db.submission.findMany({
        where: { studentId, status: { in: ['submitted', 'graded'] }, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          score: true,
          submittedAt: true,
          assignment: { select: { title: true, grammarItem: true, difficulty: true, questionCount: true } },
        },
      }),
    ]);

    // 排除 source='assignment' 的 practiceSession，避免與下方 assignmentSessions 重複
    const filteredSessions = sessions.filter(s => s.source !== 'assignment');

    const assignmentSessions = submissions.map(submission => {
      const totalQuestions = submission.assignment.questionCount;
      return {
        id: `assignment-${submission.id}`,
        skill: submission.assignment.grammarItem || 'assignment',
        skillZh: submission.assignment.title,
        difficulty: submission.assignment.difficulty,
        totalQuestions,
        correctCount: Math.round(((submission.score || 0) / 100) * totalQuestions),
        source: 'assignment',
        startedAt: submission.submittedAt,
        completedAt: submission.submittedAt,
        answers: [],
      };
    });

    return NextResponse.json({
      sessions: [...filteredSessions, ...assignmentSessions]
        .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
        // 依內容去重：相同 skill + 題數 + 正確數 + source 只保留最新
        .filter((s, _i, arr) => {
          const key = `${s.skill}|${s.totalQuestions}|${s.correctCount}|${s.source}`;
          const firstIdx = arr.findIndex(x => `${x.skill}|${x.totalQuestions}|${x.correctCount}|${x.source}` === key);
          return _i === firstIdx;
        })
        .slice(0, 50),
    });
  } catch (err: unknown) {
    logger.error({ module: 'practice', error: err instanceof Error ? err.message : String(err) }, 'Practice GET failed');
    return NextResponse.json({ error: 'Failed to load practice history', sessions: [] }, { status: 500 });
  }
}
