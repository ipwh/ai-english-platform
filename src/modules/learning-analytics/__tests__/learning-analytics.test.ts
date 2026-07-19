// Sprint 37: Learning Analytics — unit tests
import { describe, it, expect } from 'vitest';

import {
  computeTrendDirection,
  computeRiskLevel,
  buildRadarData,
  buildProgressBar,
} from '../services/analytics-formula';

import type { TrendPoint, StudentTrends, TeacherDashboard, LearningStats } from '../types';

// Schemas
import { studentAnalyticsQuerySchema, teacherDashboardQuerySchema } from '../schemas';

// ============================================
// Trend Direction
// ============================================

describe('computeTrendDirection', () => {
  it('上升趨勢', () => {
    const points: TrendPoint[] = [
      { date: '2026-01-01', value: 30 },
      { date: '2026-01-08', value: 45 },
      { date: '2026-01-15', value: 60 },
    ];
    expect(computeTrendDirection(points)).toBe('up');
  });

  it('下降趨勢', () => {
    const points: TrendPoint[] = [
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-08', value: 60 },
      { date: '2026-01-15', value: 40 },
    ];
    expect(computeTrendDirection(points)).toBe('down');
  });

  it('持平', () => {
    const points: TrendPoint[] = [
      { date: '2026-01-01', value: 50 },
      { date: '2026-01-08', value: 51 },
      { date: '2026-01-15', value: 50 },
    ];
    expect(computeTrendDirection(points)).toBe('stable');
  });

  it('單點應為 stable', () => {
    expect(computeTrendDirection([{ date: '2026-01-01', value: 50 }])).toBe('stable');
  });
});

// ============================================
// Risk Level
// ============================================

describe('computeRiskLevel', () => {
  it('< 35 → high', () => expect(computeRiskLevel(20)).toBe('high'));
  it('35-59 → medium', () => expect(computeRiskLevel(45)).toBe('medium'));
  it('>= 60 → low', () => expect(computeRiskLevel(75)).toBe('low'));
});

// ============================================
// Radar & Progress
// ============================================

describe('Chart helpers', () => {
  it('buildRadarData 應保留原始值', () => {
    const data = { grammar: 65, vocabulary: 70 };
    expect(buildRadarData(data)).toEqual(data);
  });

  it('buildProgressBar 應按值降序', () => {
    const items = [
      { label: 'A', value: 30 },
      { label: 'B', value: 80 },
      { label: 'C', value: 50 },
    ];
    const result = buildProgressBar(items);
    expect(result[0].label).toBe('B');
    expect(result[2].label).toBe('A');
  });
});

// ============================================
// Type validation
// ============================================

describe('Learning Analytics — 型別結構', () => {
  it('StudentTrends 結構', () => {
    const trends: StudentTrends = {
      studentId: 's1',
      learningTrend: [],
      masteryTrend: {},
      writingTrend: [],
      vocabularyTrend: [],
      grammarTrend: [],
      overallDirection: 'stable',
      generatedAt: new Date(),
    };
    expect(trends.overallDirection).toBe('stable');
  });

  it('TeacherDashboard 結構', () => {
    const dash: TeacherDashboard = {
      teacherId: 't1',
      weakSkills: [],
      strongSkills: [],
      classComparison: {},
      progress: { improving: 0, stable: 0, declining: 0, total: 0 },
      predictions: [],
      charts: {
        skillRadar: {},
        progressBar: [],
        trendLine: [],
      },
      generatedAt: new Date(),
    };
    expect(dash.teacherId).toBe('t1');
  });

  it('LearningStats 結構', () => {
    const stats: LearningStats = {
      studentId: 's1',
      totalPractices: 10,
      totalMistakes: 3,
      totalVocabulary: 20,
      totalWritingSubmissions: 2,
      overallMastery: 65,
      streak: 5,
      weeklyActivity: [],
      generatedAt: new Date(),
    };
    expect(stats.overallMastery).toBe(65);
  });
});

// ============================================
// Schema validation
// ============================================

describe('Learning Analytics Schemas', () => {
  it('studentAnalyticsQuerySchema 應接受有效查詢', () => {
    expect(studentAnalyticsQuerySchema.safeParse({ studentId: 's1' }).success).toBe(true);
  });

  it('studentAnalyticsQuerySchema 應拒絕無 studentId', () => {
    expect(studentAnalyticsQuerySchema.safeParse({}).success).toBe(false);
  });

  it('studentAnalyticsQuerySchema 預設 weeks=12', () => {
    const r = studentAnalyticsQuerySchema.parse({ studentId: 's1' });
    expect(r.weeks).toBe(12);
  });

  it('teacherDashboardQuerySchema 應接受有效查詢', () => {
    expect(teacherDashboardQuerySchema.safeParse({ teacherId: 't1' }).success).toBe(true);
  });

  it('teacherDashboardQuerySchema 應接受可選 classId', () => {
    expect(teacherDashboardQuerySchema.safeParse({ teacherId: 't1', classId: 'c1' }).success).toBe(true);
  });

  it('teacherDashboardQuerySchema 應拒絕無 teacherId', () => {
    expect(teacherDashboardQuerySchema.safeParse({}).success).toBe(false);
  });
});

// ============================================
// Edge cases
// ============================================

describe('Learning Analytics — 邊界情況', () => {
  it('空 trend 陣列 → stable', () => {
    expect(computeTrendDirection([])).toBe('stable');
  });

  it('全零值 → stable', () => {
    expect(computeTrendDirection([
      { date: 'a', value: 0 }, { date: 'b', value: 0 },
    ])).toBe('stable');
  });

  it('riskLevel 邊界值', () => {
    expect(computeRiskLevel(34)).toBe('high');
    expect(computeRiskLevel(35)).toBe('medium');
    expect(computeRiskLevel(59)).toBe('medium');
    expect(computeRiskLevel(60)).toBe('low');
  });
});
