// ============================================
// Streak Service — DB-based daily streak tracking
// Replaces localStorage-based dailyLogin tracking
// Uses LoginLog + PracticeSession to calculate streaks
// ============================================

import { ProgressRepo, StudentRepo } from '@/modules/repositories';

/**
 * Calculate the current streak for a student based on their
 * login and practice activity history in the database.
 * A "day" counts if the user either logged in OR completed a practice session.
 */
export async function calculateStudentStreak(studentId: string): Promise<{
  streakDays: number;
  lastActiveDate: string | null;
}> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  // Get all unique active dates from both login logs and practice sessions
  const [loginLogs, practiceSessions] = await Promise.all([
    ProgressRepo.getLoginDates(studentId),
    ProgressRepo.getPracticeDates(studentId),
  ]);

  // Merge and deduplicate dates
  const activeDates = new Set<string>();
  for (const log of loginLogs) {
    activeDates.add(new Date(log.loginAt).toISOString().slice(0, 10));
  }
  for (const session of practiceSessions) {
    activeDates.add(new Date(session.startedAt).toISOString().slice(0, 10));
  }

  const sortedDates = Array.from(activeDates).sort().reverse();

  if (sortedDates.length === 0) {
    return { streakDays: 0, lastActiveDate: null };
  }

  const lastActive = sortedDates[0];

  // Streak must include today or yesterday
  if (lastActive !== today && lastActive !== yesterday) {
    return { streakDays: 0, lastActiveDate: lastActive };
  }

  // Count consecutive days backward
  let streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
    if (diffDays <= 1.5) {
      streak++;
    } else {
      break;
    }
  }

  return { streakDays: streak, lastActiveDate: lastActive };
}

/**
 * Update the user's streakDays field in DB.
 * Called after login or practice session completion.
 */
export async function syncUserStreak(studentId: string): Promise<number> {
  const { streakDays } = await calculateStudentStreak(studentId);
  await StudentRepo.updateUserStreak(studentId, streakDays);
  return streakDays;
}