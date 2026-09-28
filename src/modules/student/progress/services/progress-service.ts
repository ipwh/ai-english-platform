// Sprint 4: Progress Service — aggregated progress, gamification, streaks
import { calculateStudentStreak } from '@/modules/student/progress/services/streak-service';
import { getLevelInfo, getDailyGoal, evaluateDailyGoal, type DailyGoalStatus } from '@/modules/student/progress/services/gamification';
import { getDailyGoalCounts, getWeeklyActiveDaysMap } from '../repositories/progress-repo';
import { hkStartOfDay } from '@/shared/utils/hk-date';

export async function getStudentProgress(studentId: string) {
  const { streakDays } = await calculateStudentStreak(studentId);
  const { level, title } = getLevelInfo(0);
  const { questions, xpTarget } = getDailyGoal();
  return { level, levelTitle: title, streakDays, dailyQuestions: questions, dailyXp: xpTarget };
}

/**
 * 每日目標進度（含深度要件）— Sprint 133。
 * 完成判定 = 題數達標 AND（今日挑戰 ∨ 複習 3 錯題 ∨ 掌握 3 生字）。
 */
export async function getDailyGoalProgress(studentId: string, gradeLevel?: string): Promise<DailyGoalStatus> {
  // 「今日」= 香港日（2026-09-20 稽核：舊碼用伺服器本地時間，雲端為 UTC → 目標於香港 08:00 才重置）
  const counts = await getDailyGoalCounts(studentId, hkStartOfDay());
  return evaluateDailyGoal(counts, gradeLevel);
}

/** 每週活躍日數（排行榜初中模式）— Sprint 133 */
export async function getWeeklyActiveDays(userIds: string[], weekStart: Date): Promise<Map<string, number>> {
  return getWeeklyActiveDaysMap(userIds, weekStart);
}
