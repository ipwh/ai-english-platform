// Sprint 37: Learning Analytics — unit tests
import { describe, it, expect } from 'vitest';

import { computeTrendDirection } from '../services/analytics-formula';

import type { TrendPoint, StudentTrends, LearningStats } from '../types';

// Schemas
import { studentAnalyticsQuerySchema } from '../schemas';

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

  it('LearningStats 結構', () => {
    const stats: LearningStats = {
      studentId: 's1',
      totalPractices: 10,
      totalMistakes: 3,
      totalVocabulary: 20,
      overallMastery: 65,
      streak: 5,
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
});
