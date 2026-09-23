// Sprint 61: StudentStateMutationService — the ONLY component allowed to mutate student engagement state
// CQRS: StudentStateBuilder (reads) + StudentStateMutationService (writes)
// Architecture: Route → MutationService → Repository

import { logger } from '@/shared/logger/logger';
import { hkDayKey, hkWeekStartMondayUtc, hkWeekStartUtc } from '@/shared/utils/hk-date';
import { calculateXp, getLevelInfo, checkNewBadges, getAllBadges, getGradeMultiplier } from '../progress/services/gamification';
import type { XpEvent, BadgeCheckStats, BadgeDefinition } from '../progress/services/gamification';
import { studentStateBuilder } from './StudentStateBuilder';

// ============================================
// Local types for repository select results
// ============================================

interface UserSelectResult {
  streakDays?: number | null;
  overallAccuracy?: number | null;
  xp?: number | null;
  badgeIds?: string | null;
  level?: string | null;
}

interface VocabStatsResult {
  mastered?: number;
  total?: number;
  [key: string]: unknown;
}

// ============================================
// 可驗證活動投影（單一入口；accuracy 與週快照共用）
// ============================================

/** 具備「可驗證評分證據」的活動（練習場次 + 已評分 submissions） */
export interface VerifiedActivity {
  totalQuestions: number;
  correctCount: number;
  completedAt: Date;
}

/**
 * R3.10-C: 只有具備「可驗證評分證據」的 sessions 才計入 accuracy。
 * 零答案 / presence / 歷史不可驗證的 sessions 一律排除，永不修復。
 * 供 `syncActivityMetrics` 與準確率回填腳本共用，避免兩套規則漂移。
 */
export async function collectVerifiedActivities(
  sessions: Iterable<{ startedAt: Date; answers: unknown }>,
): Promise<VerifiedActivity[]> {
  const { evaluatePracticeEvidence } = await import('@/modules/exercise/services/practice-evidence-service');
  const out: VerifiedActivity[] = [];
  for (const s of sessions) {
    const evidence = evaluatePracticeEvidence(s.answers);
    if (evidence.status !== 'verified') continue;
    out.push({
      totalQuestions: evidence.totalQuestions,
      correctCount: evidence.correctCount,
      completedAt: s.startedAt,
    });
  }
  return out;
}

// ============================================
// StudentStateMutationService
// ============================================

export class StudentStateMutationService {

  /**
   * Award XP for a learning event and persist.
   * Delegates computation to gamification.ts but coordinates the write.
   */
  async awardXp(studentId: string, event: XpEvent): Promise<{ xpGained: number; newLevel: number }> {
    const { findUserByIdSelect } = await import('@/modules/student/repositories/user-repo');
    const { applyXpEventOnce } = await import('../progress/repositories/progress-repo');

    // Sprint 133: 初中 1.2× 只適用於深度學習事件（複習錯題／生字掌握），
    // 刷 MC／登入不再享年級加成。
    const student = await findUserByIdSelect(studentId, { level: true }).catch(() => null) as UserSelectResult | null;
    const gradeMultiplier = getGradeMultiplier(student?.level ?? undefined, event.type);
    const xpGained = Math.round(calculateXp(event) * gradeMultiplier);

    const idempotencyKey = typeof event.metadata?.idempotencyKey === 'string'
      ? event.metadata.idempotencyKey
      : undefined;
    const created = await applyXpEventOnce({
      userId: studentId,
      event: event.type,
      xpAmount: xpGained,
      metadata: JSON.stringify(event.metadata || {}),
      idempotencyKey,
      incrementStreak: event.type === 'dailyLogin',
    });

    // Read updated XP to compute level
    const state = await studentStateBuilder.build(studentId);
    const newLevel = state.engagement.level;

    return { xpGained: created ? xpGained : 0, newLevel };
  }

  /**
   * Increment streak by 1 day.
   */
  async incrementStreak(studentId: string): Promise<number> {
    const { updateUser, findUserByIdSelect } = await import('@/modules/student/repositories/user-repo');
    await updateUser(studentId, { streakDays: { increment: 1 } });
    const user = await findUserByIdSelect(studentId, { streakDays: true }) as UserSelectResult | null;
    return user?.streakDays ?? 0;
  }

  /**
   * Check for newly earned badges and persist them.
   * Returns the full badge list and any newly earned badges.
   */
  async checkAndAwardBadges(studentId: string): Promise<{
    allBadges: BadgeDefinition[];
    newBadges: BadgeDefinition[];
  }> {
    const { findUserByIdSelect, updateUser } = await import('@/modules/student/repositories/user-repo');
    const { countPracticeSessions } = await import('@/modules/exercise/repositories/practice-repo');
    const { getCumulativeSkillTotals } = await import('@/modules/exercise/services/practice-history-service');
    const { getVocabStats } = await import('@/modules/vocabulary/repositories/vocabulary-repo');
    const { countDrafts } = await import('@/modules/writing-coach/repositories/writing-draft-repo');
    const { db } = await import('@/shared/db/db');

    // 2026-09-20 稽核：每週挑戰窗口改用香港週界線（原本 UTC 午夜）
    const weekStart = hkWeekStartUtc(6);

    const [student, cumulativeSkillTotals, vocab, writingCount, sessionsCount, mistakesReviewed, weeklyChallenges] = await Promise.all([
      findUserByIdSelect(studentId, { streakDays: true, overallAccuracy: true, xp: true, badgeIds: true, level: true }).catch(() => null) as Promise<UserSelectResult | null>,
      // 2026-09-23 稽核修正：徽章統計的累積題數改由**全歷史正典投影**推導。
      // 舊碼用 listPracticeSessions(studentId, 200)（最新 200 場），而且是
      // **recorded** 而非 verified 總數 —— 長期使用者的累積題數會被截斷，
      // 令 `totalQuestions >= 50/100` 這類徽章條件失真。
      getCumulativeSkillTotals(studentId).catch(() => [] as Array<{ questions: number }>),
      getVocabStats(studentId).catch(() => ({ mastered: 0 })) as Promise<VocabStatsResult>,
      countDrafts(studentId).catch(() => 0),
      countPracticeSessions(studentId).catch(() => 0),
      db.mistakeReviewLog.count({ where: { studentId } }).catch(() => 0),
      db.practiceSession.count({ where: { studentId, source: 'daily-challenge', startedAt: { gte: weekStart } } }).catch(() => 0),
    ]);

    const totalQuestions = cumulativeSkillTotals.reduce((sum: number, s: { questions: number }) => sum + s.questions, 0);

    const stats: BadgeCheckStats = {
      totalQuestions,
      overallAccuracy: student?.overallAccuracy ?? 0,
      streakDays: student?.streakDays ?? 0,
      sessionsCompleted: sessionsCount as number,
      wordsMastered: vocab.mastered ?? 0,
      writingSubmissions: writingCount as number,
      diagnosticCompleted: false,
      skillAccuracy: {},
      mistakesReviewed: mistakesReviewed as number,
      weeklyChallenges: weeklyChallenges as number,
      gradeLevel: student?.level ?? undefined,
    };

    let alreadyUnlocked: string[] = [];
    try {
      alreadyUnlocked = student?.badgeIds ? JSON.parse(student.badgeIds) : [];
    } catch { alreadyUnlocked = []; }

    const allBadges = getAllBadges(stats, alreadyUnlocked);
    const newBadges = checkNewBadges(stats, alreadyUnlocked);

    if (newBadges.length > 0) {
      const updatedIds = [...alreadyUnlocked, ...newBadges.map((b: BadgeDefinition) => b.id)];
      await updateUser(studentId, { badgeIds: JSON.stringify(updatedIds) });
    }

    return { allBadges, newBadges };
  }

  /**
   * Get engagement stats (reads through StudentStateBuilder for consistency).
   */
  async getEngagementStats(studentId: string) {
    const state = await studentStateBuilder.build(studentId);
    return {
      xp: state.engagement.xp,
      level: state.engagement.level,
      streakDays: state.engagement.streakDays,
      badges: state.engagement.badges,
      overallAccuracy: state.engagement.overallAccuracy,
      stats: {
        totalQuestions: state.practice.totalQuestions,
        totalSessions: state.practice.totalSessions,
      },
    };
  }
  // 2026-09-21 稽核：`updateOverallAccuracy(accuracy: number)` 與
  // `updateWeeklySnapshot()` 已刪除 —— 兩者皆**零呼叫者**，而且
  // `updateOverallAccuracy` 的簽名（`accuracy: number`）容許寫入 0 冒充
  // 「無資料」，正是本專案明文禁止的模式。所有準確率／週快照寫入一律經
  // `syncActivityMetrics()`（單一 owner，無證據 ⇒ null）。

  /**
   * Sync all student activity metrics: recompute accuracy from sessions/submissions,
   * update user record, and upsert weekly snapshot.
   * Canonical mutation path for activity-accounting-service.
   *
   * 2026-09-20 稽核修正（DB 實證：852 名學生中 837 名 overallAccuracy = 0）：
   * 1. **移除「最新 200 場」上限**（同一天改為全歷史分頁），否則累積準確率會被截斷。
   * 2. **無可驗證證據 → 寫 null（不是 0）**。「無資料」與「答錯全部」必須可區分
   *    （舊碼寫 0 令所有未練習學生顯示「準確率 0%」，亦壓低班平均）。
   * 3. 週界線改香港週一（原本用 UTC 週一）。
   */
  async syncActivityMetrics(studentId: string): Promise<{ accuracy: number | null; weekStart: string }> {
    const { db } = await import('@/shared/db/db');
    const { listAllSessionsWithEvidence } = await import('@/modules/exercise/services/practice-history-service');

    const [sessions, submissions] = await Promise.all([
      listAllSessionsWithEvidence(studentId).catch(() => [] as Array<{ id: string; startedAt: Date; answers: unknown[] }>),
      db.submission.findMany({
        where: {
          studentId,
          status: { in: ['submitted', 'graded'] },
          submittedAt: { not: null },
          score: { not: null },
        },
        select: {
          score: true,
          submittedAt: true,
          assignment: { select: { questionCount: true } },
        },
      }),
    ]);

    const activities: VerifiedActivity[] = [
      ...(await collectVerifiedActivities(sessions)),
      ...submissions.map(s => ({ totalQuestions: s.assignment.questionCount, correctCount: Math.round((s.score! / 100) * s.assignment.questionCount), completedAt: s.submittedAt! })),
    ];

    const totalQuestions = activities.reduce((sum, a) => sum + a.totalQuestions, 0);
    const correctCount = activities.reduce((sum, a) => sum + a.correctCount, 0);
    // null = 無可驗證證據（「無資料」≠ 0%）
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : null;

    // Update user record
    const { updateUser } = await import('@/modules/student/repositories/user-repo');
    await updateUser(studentId, { overallAccuracy: accuracy });

    // Update weekly snapshot（週界線 = 香港週一）
    const now = new Date();
    const weekKey = (d: Date) => hkDayKey(hkWeekStartMondayUtc(d));
    const weekStart = weekKey(now);
    const weekActs = activities.filter(a => weekKey(a.completedAt) === weekStart);
    const weekTotal = weekActs.reduce((sum, a) => sum + a.totalQuestions, 0);
    const weekCorrect = weekActs.reduce((sum, a) => sum + a.correctCount, 0);
    /** Float 欄位不可為 null；無資料時存 0，顯示層以 totalQuestions === 0 判定為「—」 */
    const weekAccuracy = weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0;

    await db.weeklySnapshot.upsert({
      where: { userId_weekStart: { userId: studentId, weekStart } },
      create: { userId: studentId, weekStart, totalQuestions: weekTotal, correctCount: weekCorrect, accuracy: weekAccuracy, sessionsCount: weekActs.length, xpGained: 0, streakDays: 0, wordsLearned: 0 },
      update: { totalQuestions: weekTotal, correctCount: weekCorrect, accuracy: weekAccuracy, sessionsCount: weekActs.length },
    });

    return { accuracy, weekStart };
  }
}

export const studentStateMutationService = new StudentStateMutationService();
