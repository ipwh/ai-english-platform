// Sprint 61: StudentStateMutationService — the ONLY component allowed to mutate student engagement state
// CQRS: StudentStateBuilder (reads) + StudentStateMutationService (writes)
// Architecture: Route → MutationService → Repository

import { logger } from '@/shared/logger/logger';
import { calculateXp, getLevelInfo, checkNewBadges, getAllBadges } from '@/modules/progress/services/gamification';
import type { XpEvent, BadgeCheckStats, BadgeDefinition } from '@/modules/progress/services/gamification';
import { studentStateBuilder } from './StudentStateBuilder';

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
    const { createXpTransaction } = await import('@/modules/progress/repositories/progress-repo');

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
        amount: xpGained,
        source: event.type,
        metadata: event.metadata || {},
      } as any);
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
    await updateUser(studentId, { streakDays: { increment: 1 } } as any);
    const user = await findUserByIdSelect(studentId, { streakDays: true });
    return (user as any)?.streakDays ?? 0;
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
      findUserByIdSelect(studentId, { streakDays: true, overallAccuracy: true, xp: true, badgeIds: true }).catch(() => null),
      listPracticeSessions(studentId, 200).catch(() => [] as { totalQuestions: number }[]),
      getVocabStats(studentId).catch(() => ({ mastered: 0 })),
      countDrafts(studentId).catch(() => 0),
      countPracticeSessions(studentId).catch(() => 0),
    ]);

    const totalQuestions = sessions.reduce((sum: number, s: { totalQuestions: number }) => sum + s.totalQuestions, 0);

    const stats: BadgeCheckStats = {
      totalQuestions,
      overallAccuracy: (student as any)?.overallAccuracy ?? 0,
      streakDays: (student as any)?.streakDays ?? 0,
      sessionsCompleted: sessionsCount as number,
      wordsMastered: (vocab as any).mastered ?? 0,
      writingSubmissions: writingCount as number,
      diagnosticCompleted: false,
      skillAccuracy: {},
    };

    let alreadyUnlocked: string[] = [];
    try {
      alreadyUnlocked = (student as any)?.badgeIds ? JSON.parse((student as any).badgeIds) : [];
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
}

export const studentStateMutationService = new StudentStateMutationService();
