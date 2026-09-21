// ============================================
// Practice Repository — centralized data access for practice sessions & answers
// P1: Repository Layer Migration
// ============================================

import { db } from '@/shared/db/db';
import { hkStartOfDay } from '@/shared/utils/hk-date';

/** Create a practice session */
export async function createPracticeSession(data: {
  studentId: string;
  skill: string;
  skillZh: string;
  difficulty: string;
  totalQuestions: number;
  correctCount: number;
  source: string;
  completedAt?: Date;
}) {
  return db.practiceSession.create({ data });
}

/** Find today's session for a student by source（「今日」= 香港日） */
export async function findTodaySession(studentId: string, source: string) {
  return db.practiceSession.findFirst({
    where: { studentId, source, startedAt: { gte: hkStartOfDay() } },
  });
}

/**
 * Count today's sessions for a student by source（「今日」= 香港日）。
 * Used for concurrency-safe duplicate detection (2026-08-30 audit R8):
 * the find-then-create window cannot be closed without a DB constraint,
 * so callers re-count after creation and roll back the loser.
 */
export async function countTodaySessions(studentId: string, source: string) {
  return db.practiceSession.count({
    where: { studentId, source, startedAt: { gte: hkStartOfDay() } },
  });
}

/** Delete a practice session by id (race-loser rollback) */
export async function deletePracticeSession(id: string) {
  return db.practiceSession.delete({ where: { id } });
}

/** List practice sessions with basic stats (for analytics/gamification) */
export async function listPracticeSessionsSimple(studentId: string, limit = 100) {
  return db.practiceSession.findMany({
    where: { studentId },
    select: { skill: true, totalQuestions: true, correctCount: true, startedAt: true },
    take: limit,
  });
}

/** Count practice sessions for a student */
export async function countPracticeSessions(studentId: string) {
  return db.practiceSession.count({ where: { studentId } });
}

/** Answer row accepted for persistence (structural contract) */
export interface PracticeAnswerRowInput {
  questionIndex: number;
  /** Canonical question identity (PracticeQuestion.id / ReadingQuestion.id) — required for new rows */
  questionId: string;
  questionType?: string;
  questionPrompt?: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  /** R3.2: actual runtime scoring (preserved verbatim) */
  result?: string;
  awardedScore?: number;
  maxScore?: number;
  countsTowardScore?: boolean;
  /** R3.3/R3.7: actual scoring authority for this row */
  scoredBy?: string;
  scoringMethod?: string;
  timeSpent?: number | null;
}

function mapAnswerRows(sessionId: string, answers: PracticeAnswerRowInput[]) {
  return answers.map((a, idx) => ({
    sessionId,
    questionIndex: a.questionIndex ?? idx,
    questionId: a.questionId,
    questionType: a.questionType || 'mc',
    questionPrompt: a.questionPrompt || '',
    correctAnswer: a.correctAnswer || '',
    studentAnswer: a.studentAnswer || '',
    isCorrect: a.isCorrect,
    result: a.result,
    awardedScore: a.awardedScore,
    maxScore: a.maxScore,
    countsTowardScore: a.countsTowardScore ?? true,
    scoredBy: a.scoredBy,
    scoringMethod: a.scoringMethod,
    timeSpent: a.timeSpent ?? null,
  }));
}

/** Create answers for a practice session */
export async function createPracticeAnswers(
  sessionId: string,
  answers: PracticeAnswerRowInput[],
) {
  if (!answers || answers.length === 0) return [];
  return db.practiceAnswer.createMany({ data: mapAnswerRows(sessionId, answers) });
}

/**
 * R37-H01/H02: Atomic practice execution.
 * PracticeSession (which carries the authoritative aggregate values) and
 * ALL PracticeAnswer rows commit or roll back together. No partial
 * session can ever remain: no session without its full item evidence,
 * no aggregate without matching items.
 *
 * R3.10-E.2 P0-3: when `clientSubmissionId` is provided, the execution is
 * REPLAY-SAFE — a repeated key returns the original persisted session
 * ({ created: false }) with no writes and no side effects. The key is
 * ONLY a replay/dedup mechanism, never an authority signal.
 * Concurrent duplicates resolve via the (studentId, clientSubmissionId)
 * unique index with a P2002 race catch.
 */
export async function createPracticeExecutionTx(input: {
  session: {
    studentId: string;
    skill: string;
    skillZh: string;
    difficulty: string;
    totalQuestions: number;
    correctCount: number;
    source: string;
    completedAt?: Date;
    clientSubmissionId?: string | null;
  };
  answers: PracticeAnswerRowInput[];
}): Promise<{ id: string; created: boolean; skill: string; skillZh: string; totalQuestions: number; correctCount: number }> {
  const { clientSubmissionId } = input.session;
  const clientKey = clientSubmissionId && clientSubmissionId.length > 0 ? clientSubmissionId : null;

  return db.$transaction(async tx => {
    if (clientKey) {
      const existing = await tx.practiceSession.findUnique({
        where: { studentId_clientSubmissionId: { studentId: input.session.studentId, clientSubmissionId: clientKey } },
      });
      if (existing) return {
        id: existing.id, created: false, skill: existing.skill, skillZh: existing.skillZh,
        totalQuestions: existing.totalQuestions, correctCount: existing.correctCount,
      };
    }

    try {
      const session = await tx.practiceSession.create({ data: input.session });
      if (input.answers.length > 0) {
        await tx.practiceAnswer.createMany({ data: mapAnswerRows(session.id, input.answers) });
      }
      return {
        id: session.id, created: true, skill: session.skill, skillZh: session.skillZh,
        totalQuestions: session.totalQuestions, correctCount: session.correctCount,
      };
    } catch (err) {
      // Concurrent duplicate raced past the pre-check: unique violation.
      if (clientKey && err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002') {
        const existing = await tx.practiceSession.findUnique({
          where: { studentId_clientSubmissionId: { studentId: input.session.studentId, clientSubmissionId: clientKey } },
        });
        if (existing) return {
          id: existing.id, created: false, skill: existing.skill, skillZh: existing.skillZh,
          totalQuestions: existing.totalQuestions, correctCount: existing.correctCount,
        };
      }
      throw err;
    }
  });
}

/** List practice sessions for a student */
export async function listPracticeSessions(studentId: string, limit = 50) {
  return db.practiceSession.findMany({
    where: { studentId },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * R3.10-C（批次變體，2026-09-21 稽核）：多名學生的練習場次 + 逐題證據。
 *
 * 供「累積」語意的批次消費者（匯出報表、班級／全校統計）使用。
 * **不得**單獨以 `take` 當作全量：呼叫端必須分頁迭代到不足一頁為止
 * （見 `practice-history-service.aggregateVerifiedTotalsForStudents()`）。
 *
 * 固定以 `startedAt desc, id asc` 排序，令 `skip` 分頁在全域層面穩定
 * （同分時間不會令同一列重複或漏掉）。
 */
export async function listPracticeSessionsWithEvidenceForStudents(
  studentIds: string[],
  limit = 500,
  skip = 0,
) {
  if (studentIds.length === 0) return [];
  return db.practiceSession.findMany({
    where: { studentId: { in: studentIds } },
    select: {
      studentId: true,
      skill: true,
      totalQuestions: true,
      correctCount: true,
      source: true,
      startedAt: true,
      answers: {
        select: {
          countsTowardScore: true,
          awardedScore: true,
          maxScore: true,
          result: true,
          scoredBy: true,
          scoringMethod: true,
        },
        orderBy: { questionIndex: 'asc' },
      },
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    take: limit,
    skip,
  });
}

/**
 * R3.10-C: List practice sessions WITH persisted answer evidence rows.
 * Consumers of verified accuracy must use this (with
 * evaluatePracticeEvidence) instead of trusting session aggregates.
 *
 * `skip` / `since` 支援「累積投影」分頁（2026-09-20 稽核）：
 * 累積統計必須走日期界線 + 全歷史分頁，不可用單一 `take` 當作全量。
 */
export async function listPracticeSessionsWithEvidence(
  studentId: string,
  limit = 200,
  skip = 0,
  since?: Date,
) {
  return db.practiceSession.findMany({
    where: { studentId, ...(since ? { startedAt: { gte: since } } : {}) },
    select: {
      id: true,
      skill: true,
      skillZh: true,
      difficulty: true,
      totalQuestions: true,
      correctCount: true,
      source: true,
      startedAt: true,
      completedAt: true,
      answers: {
        select: {
          questionId: true,
          result: true,
          awardedScore: true,
          maxScore: true,
          countsTowardScore: true,
          scoredBy: true,
          scoringMethod: true,
        },
        orderBy: { questionIndex: 'asc' },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
    skip,
  });
}

/** Find a practice session by ID */
export async function findPracticeSession(id: string) {
  return db.practiceSession.findUnique({
    where: { id },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
  });
}
/** Update a practice session (e.g., mark as completed) */
export async function completePracticeSession(id: string, correctCount: number) {
  return db.practiceSession.update({
    where: { id },
    data: { completedAt: new Date(), correctCount },
  });
}
