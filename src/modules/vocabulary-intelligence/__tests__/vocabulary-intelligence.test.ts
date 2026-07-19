// Sprint 35: Vocabulary Intelligence — unit tests
import { describe, it, expect } from 'vitest';

// Pure formula — no DB dependency
import {
  computeVocabStatus,
  estimateDifficulty,
  buildWordProfile,
  generateVocabRecommendations,
} from '../services/vocabulary-formula';

// Types
import type { VocabStatus, VocabWordProfile } from '../types';

// Schemas
import { vocabProfileQuerySchema } from '../schemas';

// ============================================
// computeVocabStatus — 詞彙狀態判定
// ============================================

describe('computeVocabStatus — 詞彙狀態', () => {
  it('masteryLevel 5 + mastered familiarity → mastered', () => {
    expect(computeVocabStatus({
      familiarity: 'mastered', masteryLevel: 5, daysSinceReview: 5, dueForReview: false,
    })).toBe('mastered');
  });

  it('familiarity mastered + masteryLevel 4 → known', () => {
    expect(computeVocabStatus({
      familiarity: 'mastered', masteryLevel: 4, daysSinceReview: 3, dueForReview: false,
    })).toBe('known');
  });

  it('masteryLevel >= 4 → known', () => {
    expect(computeVocabStatus({
      familiarity: 'familiar', masteryLevel: 4, daysSinceReview: 2, dueForReview: false,
    })).toBe('known');
  });

  it('familiarity learning → learning', () => {
    expect(computeVocabStatus({
      familiarity: 'learning', masteryLevel: 2, daysSinceReview: 5, dueForReview: false,
    })).toBe('learning');
  });

  it('masteryLevel <= 1 + > 30 days → forgotten', () => {
    expect(computeVocabStatus({
      familiarity: 'familiar', masteryLevel: 1, daysSinceReview: 31, dueForReview: false,
    })).toBe('forgotten');
  });

  it('masteryLevel <= 2 → weak', () => {
    expect(computeVocabStatus({
      familiarity: 'new', masteryLevel: 2, daysSinceReview: 10, dueForReview: false,
    })).toBe('weak');
  });

  it('masteryLevel = 0 + > 30 days → forgotten', () => {
    expect(computeVocabStatus({
      familiarity: 'new', masteryLevel: 0, daysSinceReview: 60, dueForReview: false,
    })).toBe('forgotten');
  });

  it('dueForReview 應優先於其他狀態', () => {
    // Even if mastered, if SRS overdue → need-review
    expect(computeVocabStatus({
      familiarity: 'mastered', masteryLevel: 5, daysSinceReview: 10, dueForReview: true,
    })).toBe('need-review');
  });

  it('dueForReview 應覆蓋所有狀態', () => {
    expect(computeVocabStatus({
      familiarity: 'new', masteryLevel: 1, daysSinceReview: 50, dueForReview: true,
    })).toBe('need-review');
  });

  it('new familiarity + moderate mastery → learning', () => {
    expect(computeVocabStatus({
      familiarity: 'new', masteryLevel: 3, daysSinceReview: 2, dueForReview: false,
    })).toBe('learning');
  });
});

// ============================================
// estimateDifficulty — CEFR 難度估算
// ============================================

describe('estimateDifficulty — 難度估算', () => {
  it('短介詞 → A1', () => {
    expect(estimateDifficulty({ partOfSpeech: 'preposition', wordLength: 2, masteryLevel: 0 })).toBe('A1');
  });

  it('短冠詞 → A1', () => {
    expect(estimateDifficulty({ partOfSpeech: 'article', wordLength: 3, masteryLevel: 0 })).toBe('A1');
  });

  it('短單字 → A2', () => {
    expect(estimateDifficulty({ partOfSpeech: 'noun', wordLength: 4, masteryLevel: 0 })).toBe('A2');
  });

  it('中等長度 → B1', () => {
    expect(estimateDifficulty({ partOfSpeech: 'verb', wordLength: 7, masteryLevel: 0 })).toBe('B1');
  });

  it('較長單字 → B2', () => {
    expect(estimateDifficulty({ partOfSpeech: 'adjective', wordLength: 10, masteryLevel: 0 })).toBe('B2');
  });

  it('很長單字 → C1', () => {
    expect(estimateDifficulty({ partOfSpeech: 'noun', wordLength: 12, masteryLevel: 0 })).toBe('C1');
  });
});

// ============================================
// buildWordProfile — 建立詞彙檔案
// ============================================

describe('buildWordProfile — 詞彙檔案', () => {
  const baseInput = {
    partOfSpeech: 'noun',
    meaningZh: '蘋果',
    familiarity: 'learning',
    masteryLevel: 2,
    daysSinceReview: 15,
    dueForReview: false,
    frequency: 3,
    wordFamily: ['apple', 'applesauce'],
    collocations: ['eat an apple'],
    exampleSentences: ['I like apples.'],
    createdAt: new Date('2026-01-01'),
  };

  it('應正確建立 profile', () => {
    const profile = buildWordProfile({ ...baseInput, word: 'apple' });
    expect(profile.word).toBe('apple');
    expect(profile.status).toBe('learning'); // familiarity learning → overrides weak
    expect(profile.difficulty).toBe('A2'); // 5 chars
    expect(profile.wordFamily).toEqual(['apple', 'applesauce']);
  });

  it('mastered word 應為 mastered 狀態', () => {
    const profile = buildWordProfile({
      ...baseInput,
      word: 'sophisticated',
      familiarity: 'mastered',
      masteryLevel: 5,
    });
    expect(profile.status).toBe('mastered');
    expect(profile.difficulty).toBe('C1'); // 13 chars
  });

  it('dueForReview 應覆蓋 mastered', () => {
    const profile = buildWordProfile({
      ...baseInput,
      word: 'review',
      familiarity: 'mastered',
      masteryLevel: 5,
      dueForReview: true,
    });
    expect(profile.status).toBe('need-review');
  });
});

// ============================================
// generateVocabRecommendations — 推薦生成
// ============================================

describe('generateVocabRecommendations — 推薦', () => {
  it('need-review 數量 > 0 應包含複習建議', () => {
    const recs = generateVocabRecommendations({
      byStatus: { known: 0, learning: 0, weak: 0, forgotten: 0, mastered: 0, 'need-review': 5 },
      totalWords: 10,
      weak: [],
      forgotten: [],
      needReview: [
        { word: 'test' } as VocabWordProfile,
        { word: 'test2' } as VocabWordProfile,
      ],
    });
    expect(recs.some(r => r.includes('複習'))).toBe(true);
  });

  it('forgotten 詞彙應列出前三個', () => {
    const recs = generateVocabRecommendations({
      byStatus: { known: 0, learning: 0, weak: 0, forgotten: 3, mastered: 0, 'need-review': 0 },
      totalWords: 5,
      weak: [],
      forgotten: [
        { word: 'abandon' } as VocabWordProfile,
        { word: 'zealous' } as VocabWordProfile,
        { word: 'xylophone' } as VocabWordProfile,
      ],
      needReview: [],
    });
    expect(recs.some(r => r.includes('abandon') && r.includes('zealous'))).toBe(true);
  });

  it('無詞彙應提示建立詞彙庫', () => {
    const recs = generateVocabRecommendations({
      byStatus: { known: 0, learning: 0, weak: 0, forgotten: 0, mastered: 0, 'need-review': 0 },
      totalWords: 0,
      weak: [],
      forgotten: [],
      needReview: [],
    });
    expect(recs.some(r => r.includes('詞彙庫'))).toBe(true);
  });

  it('掌握率 > 50% 應有正面回饋', () => {
    const recs = generateVocabRecommendations({
      byStatus: { known: 0, learning: 0, weak: 0, forgotten: 0, mastered: 6, 'need-review': 0 },
      totalWords: 10,
      weak: [],
      forgotten: [],
      needReview: [],
    });
    expect(recs.some(r => r.includes('保持'))).toBe(true);
  });
});

// ============================================
// Type validation
// ============================================

describe('Vocabulary Intelligence — 型別結構', () => {
  it('VocabStatus 應包含六種狀態', () => {
    const statuses: VocabStatus[] = ['known', 'learning', 'weak', 'forgotten', 'mastered', 'need-review'];
    expect(statuses).toHaveLength(6);
  });

  it('VocabWordProfile 應有完整欄位', () => {
    const profile: VocabWordProfile = {
      word: 'test',
      partOfSpeech: 'noun',
      meaningZh: '測試',
      status: 'learning',
      familiarity: 'learning',
      masteryLevel: 2,
      daysSinceReview: 5,
      dueForReview: false,
      difficulty: 'B1',
      frequency: 3,
      wordFamily: [],
      collocations: [],
      exampleSentences: ['This is a test.'],
      createdAt: new Date(),
    };
    expect(profile.word).toBe('test');
    expect(profile.difficulty).toBe('B1');
  });
});

// ============================================
// Schema validation
// ============================================

describe('Vocabulary Schemas — Zod 驗證', () => {
  it('應接受有效查詢', () => {
    const result = vocabProfileQuerySchema.safeParse({ studentId: 'student-1' });
    expect(result.success).toBe(true);
  });

  it('應拒絕無 studentId', () => {
    const result = vocabProfileQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('預設值應正確', () => {
    const result = vocabProfileQuerySchema.parse({ studentId: 's' });
    expect(result.includeWordFamilies).toBe(true);
    expect(result.reviewLimit).toBe(10);
  });

  it('應接受可選 status filter', () => {
    const result = vocabProfileQuerySchema.safeParse({
      studentId: 's',
      status: 'weak',
    });
    expect(result.success).toBe(true);
  });

  it('應拒絕無效 status', () => {
    const result = vocabProfileQuerySchema.safeParse({
      studentId: 's',
      status: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('應接受 difficulty filter', () => {
    const result = vocabProfileQuerySchema.safeParse({
      studentId: 's',
      difficulty: 'B1',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Edge cases
// ============================================

describe('Vocabulary Intelligence — 邊界情況', () => {
  it('未知 familiarity 應 fallback 到 learning', () => {
    expect(computeVocabStatus({
      familiarity: 'unknown' as string, masteryLevel: 3, daysSinceReview: 3, dueForReview: false,
    })).toBe('learning');
  });

  it('masteryLevel 0 → 剛加入應為 weak', () => {
    expect(computeVocabStatus({
      familiarity: 'new', masteryLevel: 0, daysSinceReview: 0, dueForReview: false,
    })).toBe('weak');
  });

  it('所有 CEFR levels 應被 correctly mapped', () => {
    // Test each level with appropriate part of speech
    const results = new Set<string>();
    // A1: short article
    results.add(estimateDifficulty({ partOfSpeech: 'article', wordLength: 1, masteryLevel: 0 }));
    // A2: short noun
    results.add(estimateDifficulty({ partOfSpeech: 'noun', wordLength: 4, masteryLevel: 0 }));
    // B1: medium verb
    results.add(estimateDifficulty({ partOfSpeech: 'verb', wordLength: 7, masteryLevel: 0 }));
    // B2: long adjective
    results.add(estimateDifficulty({ partOfSpeech: 'adjective', wordLength: 10, masteryLevel: 0 }));
    // C1: very long
    results.add(estimateDifficulty({ partOfSpeech: 'noun', wordLength: 12, masteryLevel: 0 }));

    expect(results.has('A1')).toBe(true);
    expect(results.has('A2')).toBe(true);
    expect(results.has('B1')).toBe(true);
    expect(results.has('B2')).toBe(true);
    expect(results.has('C1')).toBe(true);
  });
});
