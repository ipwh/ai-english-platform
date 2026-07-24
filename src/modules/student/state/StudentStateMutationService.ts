// Sprint 61: StudentStateMutationService — the ONLY component allowed to mutate student engagement state
// CQRS: StudentStateBuilder (reads) + StudentStateMutationService (writes)
// Architecture: Route → MutationService → Repository

import { logger } from '@/shared/logger/logger';
import { calculateXp, getLevelInfo, checkNewBadges, getAllBadges } from '../progress/services/gamification';
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
}

interface VocabStatsResult {
  mastered?: number;
  total?: number;
  [key: string]: unknown;
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
    const { updateUser } = await import('@/modules/student/repositories/user-repo');
    const { createXpTransaction } = await import('../progress/repositories/progress-repo');

    const xpGained = calculateXp(event);

    // Persist XP increment + optional streak increment
    const updateData: Record<string, unknown> = { xp: { increment: xpGained } };
    if (event.type === 'dailyLogin') {
      updateData.streakDays = { increment: 1 };
    }
    await updateUser(studentId, updateData as Record<string, unknown>);

    // Record XP transaction
    try {
      await createXpTransaction({
        userId: studentId,
        event: event.type,
        xpAmount: xpGained,
        metadata: JSON.stringify(event.metadata || {}),
      });
    } catch (err) {
      logger.error({ module: 'mutation', studentId, error: String(err) }, 'Failed to create XpTransaction');
    }

    // Read updated XP to compute level
    const state = await studentStateBuilder.build(studentId);
    const newLevel = state.engagement.level;

    return { xpGained, newLevel };
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
    const { listPracticeSessions, countPracticeSessions } = await import('@/modules/exercise/repositories/practice-repo');
    const { getVocabStats } = await import('@/modules/vocabulary/repositories/vocabulary-repo');
    const { countDrafts } = await import('@/modules/writing-coach/repositories/writing-draft-repo');

    const [student, sessions, vocab, writingCount, sessionsCount] = await Promise.all([
      findUserByIdSelect(studentId, { streakDays: true, overallAccuracy: true, xp: true, badgeIds: true }).catch(() => null) as Promise<UserSelectResult | null>,
      listPracticeSessions(studentId, 200).catch(() => [] as { totalQuestions: number }[]),
      getVocabStats(studentId).catch(() => ({ mastered: 0 })) as Promise<VocabStatsResult>,
      countDrafts(studentId).catch(() => 0),
      countPracticeSessions(studentId).catch(() => 0),
    ]);

    const totalQuestions = sessions.reduce((sum: number, s: { totalQuestions: number }) => sum + s.totalQuestions, 0);

    const stats: BadgeCheckStats = {
      totalQuestions,
      overallAccuracy: student?.overallAccuracy ?? 0,
      streakDays: student?.streakDays ?? 0,
      sessionsCompleted: sessionsCount as number,
      wordsMastered: vocab.mastered ?? 0,
      writingSubmissions: writingCount as number,
      diagnosticCompleted: false,
      skillAccuracy: {},
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
  /**
   * Update overall accuracy (called by analytics after activity sync).
   */
  async updateOverallAccuracy(studentId: string, accuracy: number): Promise<void> {
    const { updateUser } = await import('@/modules/student/repositories/user-repo');
    await updateUser(studentId, { overallAccuracy: accuracy });
  }

  /**
   * Upsert weekly snapshot (called by analytics after activity sync).
   */
  async updateWeeklySnapshot(params: {
    studentId: string;
    weekStart: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
    sessionsCount: number;
  }): Promise<void> {
    const { db } = await import('@/shared/db/db');
    await db.weeklySnapshot.upsert({
      where: { userId_weekStart: { userId: params.studentId, weekStart: params.weekStart } },
      create: {
        userId: params.studentId,
        weekStart: params.weekStart,
        totalQuestions: params.totalQuestions,
        correctCount: params.correctCount,
        accuracy: params.accuracy,
        sessionsCount: params.sessionsCount,
        xpGained: 0,
        streakDays: 0,
        wordsLearned: 0,
      },
      update: {
        totalQuestions: params.totalQuestions,
        correctCount: params.correctCount,
        accuracy: params.accuracy,
        sessionsCount: params.sessionsCount,
      },
    });
  }

  /**
   * Sync all student activity metrics: recompute accuracy from sessions/submissions,
   * update user record, and upsert weekly snapshot.
   * Canonical mutation path for activity-accounting-service.
   */
  async syncActivityMetrics(studentId: string): Promise<{ accuracy: number; weekStart: string }> {
    const { db } = await import('@/shared/db/db');

    const [sessions, submissions] = await Promise.all([
      db.practiceSession.findMany({
        where: { studentId },
        select: { totalQuestions: true, correctCount: true, startedAt: true },
      }),
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

    type Activity = { totalQuestions: number; correctCount: number; completedAt: Date };
    const activities: Activity[] = [
      ...sessions.map(s => ({ totalQuestions: s.totalQuestions, correctCount: s.correctCount, completedAt: s.startedAt })),
      ...submissions.map(s => ({ totalQuestions: s.assignment.questionCount, correctCount: Math.round((s.score! / 100) * s.assignment.questionCount), completedAt: s.submittedAt! })),
    ];

    const totalQuestions = activities.reduce((sum, a) => sum + a.totalQuestions, 0);
    const correctCount = activities.reduce((sum, a) => sum + a.correctCount, 0);
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    // Update user record
    const { updateUser } = await import('@/modules/student/repositories/user-repo');
    await updateUser(studentId, { overallAccuracy: accuracy });

    // Update weekly snapshot
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekStart = monday.toISOString().slice(0, 10);
    const weekActs = activities.filter(a => {
      const d = new Date(a.completedAt);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.toISOString().slice(0, 10) === weekStart;
    });
    const weekTotal = weekActs.reduce((sum, a) => sum + a.totalQuestions, 0);
    const weekCorrect = weekActs.reduce((sum, a) => sum + a.correctCount, 0);

    await db.weeklySnapshot.upsert({
      where: { userId_weekStart: { userId: studentId, weekStart } },
      create: { userId: studentId, weekStart, totalQuestions: weekTotal, correctCount: weekCorrect, accuracy: weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0, sessionsCount: weekActs.length, xpGained: 0, streakDays: 0, wordsLearned: 0 },
      update: { totalQuestions: weekTotal, correctCount: weekCorrect, accuracy: weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0, sessionsCount: weekActs.length },
    });

    return { accuracy, weekStart };
  }
}

export const studentStateMutationService = new StudentStateMutationService();
