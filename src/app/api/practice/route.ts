import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: /api/practice — 練習記錄（僅儲存，XP 由 gamification API 控制）
// R3.10-E.2: HTTP 層只負責 auth / rate limit / 解析 / 服務調用 / 回應映射。
// 所有業務邏輯（分類、評分分派、持久化、mistake/mastery gating、
// analytics sync）由 practice-submission-service 單一擁有。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { PracticeRepo } from '@/modules/repositories';
import { evaluatePracticeEvidence } from '@/modules/exercise/services/practice-evidence-service';
import { getCumulativeSkillTotals, getWeeklyPracticeSummary } from '@/modules/exercise/services/practice-history-service';
import { submitPractice } from '@/modules/exercise/services/practice-submission-service';
import { calculatePracticeStreak } from '@/modules/student';
import { resolveTeacherStudentClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';

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
    // R3.10-C: 客戶端 totalQuestions/correctCount/totalScore 一律忽略 —
    // 所有聚合值只由伺服器評分結果推導。
    const { studentId, skill, skillZh, difficulty, source, answers, clientSubmissionId } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId 為必填 / studentId is required' }, { status: 400 });
    }

    const canAccessStudent = authResult.userId === studentId
      || authResult.role === 'admin'
      || (authResult.role === 'teacher' && await resolveTeacherStudentClass(authResult.userId!, studentId));
    if (!canAccessStudent) {
      return NextResponse.json({ error: '無權限為其他用戶儲存練習記錄 / You cannot save practice records for another user' }, { status: 403 });
    }

    const result = await submitPractice({
      studentId,
      skill,
      skillZh,
      difficulty,
      source,
      answers,
      clientSubmissionId:
        typeof clientSubmissionId === 'string' && clientSubmissionId.length > 0 ? clientSubmissionId : null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // 201 for a newly created session, 200 for an idempotent replay.
    return NextResponse.json(
      { session: { id: result.session.id, created: result.session.created }, replayed: !result.session.created },
      { status: result.session.created ? 201 : 200 },
    );
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

    const canAccessStudent = authResult.userId === studentId
      || authResult.role === 'admin'
      || (authResult.role === 'teacher' && await resolveTeacherStudentClass(authResult.userId!, studentId));
    if (!canAccessStudent) {
      return NextResponse.json({ error: '無權限查看其他用戶的練習記錄', sessions: [] }, { status: 403 });
    }

    // 2026-09-20 稽核：`sessions` 僅為「最近練習記錄」顯示視窗（最新 50 場），
    // **不得**再被任何累積/連續指標使用；累積值改由以下伺服器端投影提供：
    //   - skillTotals：全歷史累積已驗證題數（只升不跌）
    //   - weekly：香港週界線的每週摘要 + 正典連續練習天數
    const [sessions, submissions, skillTotals, weekly, streakDays] = await Promise.all([
      PracticeRepo.listPracticeSessions(studentId, 50),
      adminDbQuery('submission', 'findMany', {
        // 2026-09-23 稽核修正：必須同時要求 score not null。
        // 舊碼只濾 status/submittedAt，未批改的提交（score=null）會被
        // `(score || 0)` 轉成 correctCount=0 並標記為 status:'verified'、accuracy:0
        // → 老師看到學生「0 分」，其實只是尚未批改（違反「無資料 ≠ 0」）。
        where: { studentId, status: { in: ['submitted', 'graded'] }, submittedAt: { not: null }, score: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          score: true,
          submittedAt: true,
          assignment: { select: { title: true, grammarItem: true, difficulty: true, questionCount: true } },
        },
      }) as Promise<Array<{id: string; score: number | null; submittedAt: Date | null; assignment: {title: string; grammarItem: string | null; difficulty: string | null; questionCount: number}}>>,
      getCumulativeSkillTotals(studentId),
      getWeeklyPracticeSummary(studentId),
      calculatePracticeStreak(studentId),
    ]);

    // 排除 source='assignment' 的 practiceSession，避免與下方 assignmentSessions 重複
    const filteredSessions = sessions.filter(s => s.source !== 'assignment');

    const assignmentSessions: Array<{id: string; skill: string; skillZh: string; difficulty: string; totalQuestions: number; correctCount: number; source: string; startedAt: Date | null; completedAt: Date | null; answers: never[]}> = submissions.map(submission => {
      const totalQuestions = submission.assignment.questionCount;
      return {
        id: `assignment-${submission.id}`,
        skill: submission.assignment.grammarItem || 'assignment',
        skillZh: submission.assignment.title,
        difficulty: submission.assignment.difficulty || 'core',
        totalQuestions,
        correctCount: Math.round(((submission.score || 0) / 100) * totalQuestions),
        source: 'assignment',
        startedAt: submission.submittedAt,
        completedAt: submission.submittedAt,
        answers: [],
      };
    });

    type SessionItem = {
      id: string; skill: string; skillZh: string; difficulty: string;
      totalQuestions: number; correctCount: number; source: string;
      startedAt: Date | string | null; completedAt?: Date | string | null;
      answers?: unknown[];
    };
    const allSessions: SessionItem[] = [...filteredSessions, ...assignmentSessions];

    // R3.10-C: 每筆 session 附上「可驗證證據」投影（由 persisted rows 推導）。
    // 零答案 / 歷史不可驗證的 sessions → verified = { status: 'unverifiable' }。
    // assignment sessions 的值直接由 Submission.score（伺服器權威）推導。
    //
    // 2026-09-20 稽核：**去重與 50 筆上限只影響這份「最近記錄」清單的顯示**；
    // 技能掌握度／每週統計一律改用 `skillTotals` / `weekly`（不經此視窗）。
    const sessionsWithEvidence = allSessions
      .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
      // 智能去重：相同 (skill, totalQuestions, source) 且 startedAt 在 2 分鐘內 → 只保留 correctCount 最高者
      .reduce((acc, s) => {
        const sTime = new Date(s.startedAt ?? 0).getTime();
        const dup = acc.find(x =>
          x.skill === s.skill &&
          x.totalQuestions === s.totalQuestions &&
          x.source === s.source &&
          Math.abs(new Date(x.startedAt ?? 0).getTime() - sTime) < 120_000
        );
        if (dup) {
          if ((s.correctCount ?? 0) > (dup.correctCount ?? 0)) Object.assign(dup, s);
        } else {
          acc.push(s);
        }
        return acc;
      }, [] as SessionItem[])
      .slice(0, 50)
      .map(s => ({
        id: s.id,
        skill: s.skill,
        skillZh: s.skillZh,
        difficulty: s.difficulty,
        totalQuestions: s.totalQuestions,
        correctCount: s.correctCount,
        source: s.source,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        verified:
          s.source === 'assignment'
            ? { status: 'verified', totalQuestions: s.totalQuestions, correctCount: s.correctCount, accuracy: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : null }
            : evaluatePracticeEvidence(s.answers),
      }));

    return NextResponse.json({
      sessions: sessionsWithEvidence,
      /** 累積（只升不跌）：技能 → 已驗證題數／正確數 */
      skillTotals,
      /** 本週（香港日界線）engagement + scored 摘要；streakDays = 正典連續練習天數 */
      weekly: { ...weekly, streakDays },
    });
  } catch (err: unknown) {
    logger.error({ module: 'practice', error: err instanceof Error ? err.message : String(err) }, 'Practice GET failed');
    return NextResponse.json({ error: 'Failed to load practice history', sessions: [] }, { status: 500 });
  }
}
