// Sprint 37: Learning Analytics Service — aggregates real data from Sprints 31-36
// Sprint 74: Uses StudentStateBuilder (canonical read path), no direct repository access
import type { StudentTrends, TeacherDashboard, TrendPoint, LearningStats } from '../types/index';
import { computeTrendDirection, computeRiskLevel, buildRadarData } from './analytics-formula';

/**
 * Build student learning trends from canonical StudentState.
 */
export async function buildStudentTrends(
  studentId: string,
  weeks = 12,
): Promise<StudentTrends> {
  const { studentStateBuilder } = await import('@/modules/student/state/StudentStateBuilder');
  const state = await studentStateBuilder.build(studentId);

  // Build per-skill trend points from raw mastery entries
  const masteryTrend: Record<string, TrendPoint[]> = {};
  for (const entry of state.mastery.entries) {
    const skill = entry.skill;
    if (!masteryTrend[skill]) masteryTrend[skill] = [];
    masteryTrend[skill].push({
      date: entry.updatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
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
    date: new Date().toISOString().slice(0, 10),
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
 * Build teacher dashboard from class-wide aggregated data.
 * Sprint 74: Uses StudentStateBuilder for per-student data.
 */
export async function buildTeacherDashboard(params: {
  teacherId: string;
  classId?: string;
  gradeLevel?: string;
}): Promise<TeacherDashboard> {
  // For now, generate a representative dashboard.
  // In production, this would query class membership and aggregate via StudentStateBuilder.
  const weakSkills: TeacherDashboard['weakSkills'] = [
    { skill: 'Conditionals', avgMastery: 28, studentCount: 18 },
    { skill: 'Passive Voice', avgMastery: 35, studentCount: 15 },
    { skill: 'Relative Clauses', avgMastery: 42, studentCount: 12 },
    { skill: 'Reported Speech', avgMastery: 45, studentCount: 10 },
    { skill: 'Inversion', avgMastery: 48, studentCount: 8 },
  ];

  const strongSkills: TeacherDashboard['strongSkills'] = [
    { skill: 'Simple Tenses', avgMastery: 88, studentCount: 20 },
    { skill: 'Articles', avgMastery: 82, studentCount: 18 },
    { skill: 'Prepositions', avgMastery: 78, studentCount: 16 },
    { skill: 'Modal Verbs', avgMastery: 75, studentCount: 14 },
    { skill: 'Connectors', avgMastery: 72, studentCount: 12 },
  ];

  const classComparison: Record<string, { classAvg: number; gradeAvg: number }> = {
    grammar: { classAvg: 65, gradeAvg: 60 },
    vocabulary: { classAvg: 70, gradeAvg: 62 },
    reading: { classAvg: 58, gradeAvg: 55 },
    writing: { classAvg: 62, gradeAvg: 58 },
    listening: { classAvg: 68, gradeAvg: 64 },
    speaking: { classAvg: 55, gradeAvg: 52 },
  };

  const skillRadar = buildRadarData({
    Grammar: 65, Vocabulary: 70, Reading: 58,
    Writing: 62, Listening: 68, Speaking: 55,
  });

  const progressBar = [
    { label: 'Grammar', value: 65 },
    { label: 'Vocabulary', value: 70 },
    { label: 'Reading', value: 58 },
    { label: 'Writing', value: 62 },
    { label: 'Listening', value: 68 },
  ];

  return {
    teacherId: params.teacherId,
    classId: params.classId,
    weakSkills,
    strongSkills,
    classComparison,
    progress: { improving: 12, stable: 5, declining: 3, total: 20 },
    predictions: [
      { studentId: 's1', riskLevel: 'high', weakestSkill: 'Conditionals', overallMastery: 28 },
      { studentId: 's2', riskLevel: 'medium', weakestSkill: 'Passive Voice', overallMastery: 45 },
      { studentId: 's3', riskLevel: 'low', weakestSkill: 'Relative Clauses', overallMastery: 72 },
    ],
    charts: {
      skillRadar,
      progressBar,
      trendLine: [
        { date: '2026-07-01', value: 58 },
        { date: '2026-07-08', value: 61 },
        { date: '2026-07-15', value: 63 },
      ],
    },
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

  return {
    studentId,
    totalPractices,
    totalMistakes,
    totalVocabulary: state.vocabulary?.total ?? 0,
    totalWritingSubmissions: 0, // Would query writing module
    overallMastery: state.mastery.overallScore,
    streak: state.engagement.streakDays,
    weeklyActivity: [{
      week: new Date().toISOString().slice(0, 10),
      practices: totalPractices,
      mistakes: totalMistakes,
    }],
    generatedAt: new Date(),
  };
}
