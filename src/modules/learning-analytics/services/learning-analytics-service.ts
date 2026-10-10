// Sprint 37: Learning Analytics Service — aggregates real data from Sprints 31-36
// Sprint 74: Uses StudentStateBuilder (canonical read path), no direct repository access
import type { StudentTrends, TrendPoint, LearningStats } from '../types/index';
import { computeTrendDirection } from './analytics-formula';
import { hkDayKey, hkToday } from '@/shared/utils/hk-date';

/**
 * Build student learning trends from canonical StudentState.
 */
export async function buildStudentTrends(
  studentId: string,
  _weeks = 12,
): Promise<StudentTrends> {
  const { studentStateBuilder } = await import('@/modules/student/state/StudentStateBuilder');
  const state = await studentStateBuilder.build(studentId);

  // Build per-skill trend points from raw mastery entries
  const masteryTrend: Record<string, TrendPoint[]> = {};
  for (const entry of state.mastery.entries) {
    const skill = entry.skill;
    if (!masteryTrend[skill]) masteryTrend[skill] = [];
    masteryTrend[skill].push({
      date: entry.updatedAt ? hkDayKey(entry.updatedAt) : hkToday(),
      value: entry.masteryScore,
      label: entry.subSkill,
    });
  }

  // Learning trend: average mastery over time
  const allScores = state.mastery.entries.map(e => e.masteryScore);
  const avgMastery = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : state.mastery.overallScore;

  const learningTrend: TrendPoint[] = [{
    date: hkToday(),
    value: avgMastery,
    label: 'Overall Mastery',
  }];

  const overallDirection = computeTrendDirection(learningTrend);

  return {
    studentId,
    learningTrend,
    masteryTrend,
    writingTrend: masteryTrend['writing'] ?? [],
    vocabularyTrend: masteryTrend['vocabulary'] ?? [],
    grammarTrend: masteryTrend['grammar'] ?? [],
    overallDirection,
    generatedAt: new Date(),
  };
}

/**
 * Build learning statistics summary from canonical StudentState.
 */
export async function buildLearningStats(studentId: string): Promise<LearningStats> {
  const { studentStateBuilder } = await import('@/modules/student/state/StudentStateBuilder');
  const state = await studentStateBuilder.build(studentId);

  const totalPractices = state.mastery.entries.reduce((s, e) => s + e.practiceCount, 0);
  const totalMistakes = state.mastery.entries.reduce((s, e) => s + e.mistakeCount, 0);

  // 2026-08-30 audit (R6): no fabricated fields — writing submission counts and
  // weekly activity are derived from real repositories by the caller where needed.
  return {
    studentId,
    totalPractices,
    totalMistakes,
    totalVocabulary: state.vocabulary?.total ?? 0,
    overallMastery: state.mastery.overallScore,
    streak: state.engagement.streakDays,
    generatedAt: new Date(),
  };
}
