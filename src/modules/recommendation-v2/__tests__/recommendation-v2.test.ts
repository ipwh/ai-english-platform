// Sprint 33: Recommendation Engine 2.0 — unit tests
import { describe, it, expect } from 'vitest';

// Pure formula — no DB dependency
import {
  scoreCandidate,
  rankCandidates,
  getTopRecommendations,
  WEAKNESS_WEIGHT,
  RECENT_MISTAKES_WEIGHT,
  EXAM_IMPORTANCE_WEIGHT,
  RETENTION_DECAY_WEIGHT,
  MAX_MISTAKE_CAP,
  MAX_RETENTION_DAYS,
} from '../services/recommendation-formula';

// Types
import type { RecommendationCandidate, ScoredRecommendation } from '../types';
import { DSE_GRAMMAR_WEIGHTS, EXAM_WEIGHT_MAP } from '../types';

// Schemas
import { recommendationQuerySchema } from '../schemas';

// ============================================
// scoreCandidate — 單一候選評分
// ============================================

describe('scoreCandidate — 候選評分', () => {
  it('完全未掌握 + 大量錯誤 + 高考試權重 + 久未練習 → 最高分', () => {
    const candidate: RecommendationCandidate = {
      id: 'grammar:tenses',
      label: 'tenses',
      labelZh: '時態',
      type: 'grammar',
      masteryScore: 0,
      mistakeCount: 20,
      examWeight: 1.0,
      daysSinceLastPractice: 30,
      practiceCount: 0,
    };

    const result = scoreCandidate(candidate);

    expect(result.totalScore).toBeGreaterThanOrEqual(0.95);
    expect(result.breakdown.weaknessScore).toBe(WEAKNESS_WEIGHT);
    expect(result.breakdown.mistakeScore).toBe(RECENT_MISTAKES_WEIGHT);
    expect(result.breakdown.examScore).toBe(EXAM_IMPORTANCE_WEIGHT);
    expect(result.breakdown.retentionScore).toBe(RETENTION_DECAY_WEIGHT);
  });

  it('完全掌握 + 無錯誤 + 低考試權重 + 剛練習 → 最低分', () => {
    const candidate: RecommendationCandidate = {
      id: 'grammar:subjunctive',
      label: 'subjunctive',
      labelZh: '虛擬語氣',
      type: 'grammar',
      masteryScore: 100,
      mistakeCount: 0,
      examWeight: 0.25,
      daysSinceLastPractice: 0,
      practiceCount: 10,
    };

    const result = scoreCandidate(candidate);

    expect(result.totalScore).toBeLessThanOrEqual(0.1);
    expect(result.breakdown.weaknessScore).toBe(0);
    expect(result.breakdown.mistakeScore).toBe(0);
    expect(result.breakdown.retentionScore).toBe(0);
  });

  it('中等程度應得中等分數', () => {
    const candidate: RecommendationCandidate = {
      id: 'grammar:articles',
      label: 'articles',
      labelZh: '冠詞',
      type: 'grammar',
      masteryScore: 50,
      mistakeCount: 5,
      examWeight: 0.65,
      daysSinceLastPractice: 7,
      practiceCount: 3,
    };

    const result = scoreCandidate(candidate);

    expect(result.totalScore).toBeGreaterThan(0.2);
    expect(result.totalScore).toBeLessThan(0.6);
  });

  it('分數應在 0-1 範圍內', () => {
    for (const weight of DSE_GRAMMAR_WEIGHTS.slice(0, 5)) {
      const candidate: RecommendationCandidate = {
        id: `grammar:${weight.grammarCategory}`,
        label: weight.grammarCategory,
        labelZh: weight.grammarCategoryZh,
        type: 'grammar',
        masteryScore: Math.floor(Math.random() * 101),
        mistakeCount: Math.floor(Math.random() * MAX_MISTAKE_CAP + 1),
        examWeight: weight.normalizedWeight,
        daysSinceLastPractice: Math.floor(Math.random() * MAX_RETENTION_DAYS + 1),
        practiceCount: Math.floor(Math.random() * 20),
      };
      const result = scoreCandidate(candidate);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(1);
    }
  });

  it('weaknessScore 應與 masteryScore 成反比', () => {
    const highMastery = scoreCandidate({
      id: 't1', label: 't', labelZh: 't', type: 'grammar',
      masteryScore: 90, mistakeCount: 0, examWeight: 0.5, daysSinceLastPractice: 0, practiceCount: 5,
    });
    const lowMastery = scoreCandidate({
      id: 't2', label: 't', labelZh: 't', type: 'grammar',
      masteryScore: 30, mistakeCount: 0, examWeight: 0.5, daysSinceLastPractice: 0, practiceCount: 5,
    });
    expect(lowMastery.totalScore).toBeGreaterThan(highMastery.totalScore);
  });
});

// ============================================
// rankCandidates — 排名
// ============================================

describe('rankCandidates — 排名', () => {
  it('應按分數降序排列', () => {
    const candidates: RecommendationCandidate[] = [
      { id: 'low', label: 'low', labelZh: '低', type: 'grammar',
        masteryScore: 90, mistakeCount: 0, examWeight: 0.3, daysSinceLastPractice: 1, practiceCount: 5 },
      { id: 'high', label: 'high', labelZh: '高', type: 'grammar',
        masteryScore: 10, mistakeCount: 15, examWeight: 1.0, daysSinceLastPractice: 25, practiceCount: 1 },
      { id: 'mid', label: 'mid', labelZh: '中', type: 'grammar',
        masteryScore: 50, mistakeCount: 5, examWeight: 0.6, daysSinceLastPractice: 10, practiceCount: 3 },
    ];

    const ranked = rankCandidates(candidates);

    expect(ranked[0].candidate.id).toBe('high');
    expect(ranked[1].candidate.id).toBe('mid');
    expect(ranked[2].candidate.id).toBe('low');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
  });

  it('相同分數應相鄰排列', () => {
    const c: RecommendationCandidate = {
      id: 'same', label: 'same', labelZh: '同', type: 'grammar',
      masteryScore: 50, mistakeCount: 5, examWeight: 0.5, daysSinceLastPractice: 7, practiceCount: 3,
    };
    const ranked = rankCandidates([{ ...c, id: 'a' }, { ...c, id: 'b' }]);
    expect(ranked[0].totalScore).toBe(ranked[1].totalScore);
  });

  it('空陣列應返回空', () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it('單一候選應排名第一', () => {
    const ranked = rankCandidates([{
      id: 'only', label: 'only', labelZh: '唯一', type: 'grammar',
      masteryScore: 50, mistakeCount: 0, examWeight: 0.5, daysSinceLastPractice: 0, practiceCount: 0,
    }]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });
});

// ============================================
// getTopRecommendations — 篩選前N名
// ============================================

describe('getTopRecommendations — 前N名篩選', () => {
  const candidates: RecommendationCandidate[] = [
    { id: 'g:high', label: 'tenses', labelZh: '時態', type: 'grammar',
      masteryScore: 10, mistakeCount: 10, examWeight: 1.0, daysSinceLastPractice: 20, practiceCount: 1 },
    { id: 'g:mid', label: 'articles', labelZh: '冠詞', type: 'grammar',
      masteryScore: 50, mistakeCount: 3, examWeight: 0.65, daysSinceLastPractice: 5, practiceCount: 3 },
    { id: 'g:low', label: 'subjunctive', labelZh: '虛擬語氣', type: 'grammar',
      masteryScore: 80, mistakeCount: 0, examWeight: 0.25, daysSinceLastPractice: 1, practiceCount: 5 },
  ];

  it('應返回前 N 名', () => {
    const top = getTopRecommendations(candidates, undefined, 2);
    expect(top).toHaveLength(2);
    expect(top[0].candidate.id).toBe('g:high');
    expect(top[1].candidate.id).toBe('g:mid');
  });

  it('limit 超過總數應返回全部', () => {
    const top = getTopRecommendations(candidates, undefined, 10);
    expect(top).toHaveLength(3);
  });

  it('按類型篩選', () => {
    const grammarOnly = getTopRecommendations(candidates, 'grammar', 5);
    expect(grammarOnly.every(r => r.candidate.type === 'grammar')).toBe(true);
  });
});

// ============================================
// Type validation
// ============================================

describe('Recommendation V2 — 型別結構', () => {
  it('DSE_GRAMMAR_WEIGHTS 應有 16 個項目', () => {
    expect(DSE_GRAMMAR_WEIGHTS).toHaveLength(16);
  });

  it('EXAM_WEIGHT_MAP 應包含所有類別', () => {
    for (const w of DSE_GRAMMAR_WEIGHTS) {
      expect(EXAM_WEIGHT_MAP[w.grammarCategory]).toBe(w.normalizedWeight);
    }
  });

  it('所有 normalizedWeight 應在 0-1 範圍內', () => {
    for (const w of DSE_GRAMMAR_WEIGHTS) {
      expect(w.normalizedWeight).toBeGreaterThan(0);
      expect(w.normalizedWeight).toBeLessThanOrEqual(1);
    }
  });

  it('very-high 權重應大於 low 權重', () => {
    const veryHigh = DSE_GRAMMAR_WEIGHTS.filter(w => w.examWeight === 'very-high');
    const low = DSE_GRAMMAR_WEIGHTS.filter(w => w.examWeight === 'low');
    for (const vh of veryHigh) {
      for (const l of low) {
        expect(vh.normalizedWeight).toBeGreaterThan(l.normalizedWeight);
      }
    }
  });

  it('ScoredRecommendation 結構應完整', () => {
    const sr: ScoredRecommendation = {
      candidate: {
        id: 'test', label: 'test', labelZh: '測試',
        type: 'grammar', masteryScore: 50, mistakeCount: 3,
        examWeight: 0.5, daysSinceLastPractice: 7, practiceCount: 2,
      },
      totalScore: 0.5,
      breakdown: { weaknessScore: 0.2, mistakeScore: 0.1, examScore: 0.1, retentionScore: 0.1 },
      rank: 1,
    };
    expect(sr.rank).toBe(1);
    expect(sr.breakdown.weaknessScore).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Schema validation
// ============================================

describe('Recommendation Schemas — Zod 驗證', () => {
  it('應接受有效查詢', () => {
    const result = recommendationQuerySchema.safeParse({
      studentId: 'student-1',
      type: 'grammar',
      limit: 3,
    });
    expect(result.success).toBe(true);
  });

  it('應拒絕無 studentId', () => {
    const result = recommendationQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('預設值應正確', () => {
    const result = recommendationQuerySchema.parse({ studentId: 's' });
    expect(result.limit).toBe(5);
    expect(result.includeBreakdown).toBe(true);
  });

  it('應拒絕無效的 type', () => {
    const result = recommendationQuerySchema.safeParse({
      studentId: 's',
      type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('應拒絕超過 20 的 limit', () => {
    const result = recommendationQuerySchema.safeParse({ studentId: 's', limit: 25 });
    expect(result.success).toBe(false);
  });
});

// ============================================
// Edge cases
// ============================================

describe('Recommendation V2 — 邊界情況', () => {
  it('mistakeCount 超過 CAP 應被截斷', () => {
    const candidate: RecommendationCandidate = {
      id: 'overcap', label: 'over', labelZh: '超', type: 'grammar',
      masteryScore: 100, mistakeCount: 100, examWeight: 0, daysSinceLastPractice: 0, practiceCount: 0,
    };
    const result = scoreCandidate(candidate);
    // mistakeScore should be capped at RECENT_MISTAKES_WEIGHT max
    expect(result.breakdown.mistakeScore).toBe(RECENT_MISTAKES_WEIGHT);
  });

  it('daysSinceLastPractice 超過 MAX 應被截斷', () => {
    const candidate: RecommendationCandidate = {
      id: 'overdue', label: 'over', labelZh: '超', type: 'grammar',
      masteryScore: 100, mistakeCount: 0, examWeight: 0, daysSinceLastPractice: 365, practiceCount: 0,
    };
    const result = scoreCandidate(candidate);
    expect(result.breakdown.retentionScore).toBe(RETENTION_DECAY_WEIGHT);
  });

  it('大量候選排序效能（1000 個）', () => {
    const many: RecommendationCandidate[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `g:${i}`,
      label: `grammar-${i}`,
      labelZh: `文法${i}`,
      type: 'grammar' as const,
      masteryScore: Math.floor(Math.random() * 101),
      mistakeCount: Math.floor(Math.random() * 21),
      examWeight: Math.random(),
      daysSinceLastPractice: Math.floor(Math.random() * 31),
      practiceCount: Math.floor(Math.random() * 20),
    }));

    const start = Date.now();
    const ranked = rankCandidates(many);
    const elapsed = Date.now() - start;

    expect(ranked).toHaveLength(1000);
    // Should complete under 50ms
    expect(elapsed).toBeLessThan(50);
  });
});
