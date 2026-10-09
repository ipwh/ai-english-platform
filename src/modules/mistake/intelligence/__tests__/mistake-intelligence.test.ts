// Sprint 32: Mistake Intelligence — unit tests
import { describe, it, expect } from 'vitest';

// Pure formula — no DB dependency
import {
  calculateTrend,
  calculateWeaknessSeverityScore,
  isPersistentWeakness,
} from '../services/mistake-intelligence-formula';

// Types
import type { TrendInput, WeaknessItem, WeaknessProfile } from '../types';
import { GRAMMAR_CATEGORY_LABELS } from '../types';

// Schemas
import { weaknessQuerySchema } from '../schemas';

// ============================================
// calculateTrend — 趨勢分析
// ============================================

describe('calculateTrend — 趨勢分析', () => {
  it('持續下降應判定為 improving', () => {
    const input: TrendInput = {
      category: 'tenses',
      weeklyCounts: [10, 7, 5, 2],
    };
    expect(calculateTrend(input)).toBe('improving');
  });

  it('持續上升應判定為 worsening', () => {
    const input: TrendInput = {
      category: 'articles',
      weeklyCounts: [2, 5, 7, 10],
    };
    expect(calculateTrend(input)).toBe('worsening');
  });

  it('持平應判定為 stable', () => {
    const input: TrendInput = {
      category: 'prepositions',
      weeklyCounts: [3, 3, 3, 3],
    };
    expect(calculateTrend(input)).toBe('stable');
  });

  it('輕微波動（< 15%）應判定為 stable', () => {
    const input: TrendInput = {
      category: 'connectors',
      weeklyCounts: [10, 11, 9, 10],
    };
    expect(calculateTrend(input)).toBe('stable');
  });

  it('單週數據應返回 stable', () => {
    expect(calculateTrend({ category: 'general', weeklyCounts: [5] })).toBe('stable');
  });

  it('全零應返回 stable', () => {
    expect(calculateTrend({ category: 'general', weeklyCounts: [0, 0, 0, 0] })).toBe('stable');
  });

  it('兩週數據可判定', () => {
    expect(calculateTrend({ category: 'tenses', weeklyCounts: [8, 2] })).toBe('improving');
  });
});

// ============================================
// calculateWeaknessSeverityScore — 弱點嚴重度
// ============================================

describe('calculateWeaknessSeverityScore — 弱點嚴重度', () => {
  it('高頻率 + 最近應得高分', () => {
    const score = calculateWeaknessSeverityScore({
      mistakeCount: 10,
      daysSinceLastSeen: 0,
      totalMistakes: 20,
    });
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('低頻率 + 久遠應得低分', () => {
    const score = calculateWeaknessSeverityScore({
      mistakeCount: 1,
      daysSinceLastSeen: 30,
      totalMistakes: 50,
    });
    expect(score).toBeLessThanOrEqual(10);
  });

  it('無錯誤應為 0', () => {
    expect(
      calculateWeaknessSeverityScore({
        mistakeCount: 0,
        daysSinceLastSeen: 0,
        totalMistakes: 0,
      }),
    ).toBe(0);
  });

  it('分數應在 0-100 範圍內', () => {
    for (let i = 1; i <= 10; i++) {
      const score = calculateWeaknessSeverityScore({
        mistakeCount: i,
        daysSinceLastSeen: i * 2,
        totalMistakes: 20,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================
// isPersistentWeakness — 持續性弱點判定
// ============================================

describe('isPersistentWeakness — 持續性弱點', () => {
  it('critical + >= 2 次應判定為 persistent', () => {
    expect(isPersistentWeakness({ mistakeCount: 2, trend: 'stable', severity: 'critical' })).toBe(true);
  });

  it('critical + 1 次不應判定為 persistent', () => {
    expect(isPersistentWeakness({ mistakeCount: 1, trend: 'stable', severity: 'critical' })).toBe(false);
  });

  it('worsening + >= 3 次應判定為 persistent', () => {
    expect(isPersistentWeakness({ mistakeCount: 3, trend: 'worsening', severity: 'major' })).toBe(true);
  });

  it('worsening + 2 次不應判定為 persistent', () => {
    expect(isPersistentWeakness({ mistakeCount: 2, trend: 'worsening', severity: 'major' })).toBe(false);
  });

  it('stable + >= 5 次應判定為 persistent', () => {
    expect(isPersistentWeakness({ mistakeCount: 5, trend: 'stable', severity: 'minor' })).toBe(true);
  });

  it('stable + 4 次不應判定為 persistent', () => {
    expect(isPersistentWeakness({ mistakeCount: 4, trend: 'stable', severity: 'minor' })).toBe(false);
  });
});

// ============================================
// Type validation tests
// ============================================

describe('Mistake Intelligence — 型別結構', () => {
  it('GRAMMAR_CATEGORY_LABELS 應包含常見類別', () => {
    expect(GRAMMAR_CATEGORY_LABELS['tenses']).toBe('時態');
    expect(GRAMMAR_CATEGORY_LABELS['articles']).toBe('冠詞');
    expect(GRAMMAR_CATEGORY_LABELS['passive-voice']).toBe('被動語態');
  });

  it('WeaknessItem 應有正確結構', () => {
    const item: WeaknessItem = {
      grammarCategory: 'tenses',
      grammarCategoryZh: '時態',
      mistakeCount: 5,
      severity: 'major',
      trend: 'worsening',
      mastered: false,
      lastSeen: new Date(),
    };
    expect(item.grammarCategory).toBe('tenses');
    expect(item.mistakeCount).toBe(5);
  });

  it('WeaknessProfile 應有正確結構', () => {
    const profile: WeaknessProfile = {
      studentId: 'student-1',
      topWeaknesses: [],
      mostFrequentMistakes: [],
      improvementTrend: 'stable',
      recommendations: ['練習文法'],
      generatedAt: new Date(),
    };
    expect(profile.studentId).toBe('student-1');
    expect(profile.improvementTrend).toBe('stable');
  });
});

// ============================================
// Schema validation tests
// ============================================

describe('Mistake Intelligence Schemas — Zod 驗證', () => {
  it('weaknessQuerySchema 應接受有效查詢', () => {
    const result = weaknessQuerySchema.safeParse({
      studentId: 'student-1',
      limit: 5,
      includeRecommendations: true,
    });
    expect(result.success).toBe(true);
  });

  it('weaknessQuerySchema 應拒絕無 studentId', () => {
    const result = weaknessQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('weaknessQuerySchema 預設值應正確', () => {
    const result = weaknessQuerySchema.parse({ studentId: 'student-1' });
    expect(result.limit).toBe(10);
    expect(result.includeRecommendations).toBe(true);
  });

  it('weaknessQuerySchema 應拒絕超過 20 的 limit', () => {
    const result = weaknessQuerySchema.safeParse({ studentId: 's', limit: 25 });
    expect(result.success).toBe(false);
  });

  it('weaknessQuerySchema 應接受可選的 category', () => {
    const result = weaknessQuerySchema.safeParse({
      studentId: 'student-1',
      category: 'tenses',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('tenses');
    }
  });
});

// ============================================
// Edge cases
// ============================================

describe('Mistake Intelligence — 邊界情況', () => {
  it('大幅改善（急降）應正確判定', () => {
    expect(calculateTrend({ category: 'tenses', weeklyCounts: [20, 10, 5, 0] })).toBe('improving');
  });

  it('大幅惡化（急升）應正確判定', () => {
    expect(calculateTrend({ category: 'articles', weeklyCounts: [1, 5, 10, 20] })).toBe('worsening');
  });

  it('空陣列應為 stable', () => {
    expect(calculateTrend({ category: 'test', weeklyCounts: [] })).toBe('stable');
  });
});
