// Sprint 4: Progress Service — aggregated progress, gamification, streaks
import { calculateStudentStreak } from '@/modules/progress/services/streak-service';
import { calculateXp, getLevelInfo, getDailyGoal, type XpEvent } from '@/modules/progress/services/gamification';
import { updateUserXp } from '@/modules/student/repositories/student-repo';
import { logger } from '@/shared/logger/logger';

export async function getStudentProgress(studentId: string) {
  const { streakDays } = await calculateStudentStreak(studentId);
  const { level, title } = getLevelInfo(0);
  const { questions, xpTarget } = getDailyGoal();
  return { level, levelTitle: title, streakDays, dailyQuestions: questions, dailyXp: xpTarget };
}

export async function awardXp(studentId: string, event: string, difficulty = 'core') {
  const xp = calculateXp({ type: event as XpEvent['type'], difficulty } as XpEvent);
  await updateUserXp(studentId, xp);
  logger.info({ module: 'progress-service', studentId, event, xp }, 'XP awarded');
  return xp;
}
