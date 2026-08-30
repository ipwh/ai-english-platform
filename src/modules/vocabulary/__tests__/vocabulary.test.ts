// ============================================
// Tests: Vocabulary — AI Analysis, Dedup, SRS, Serialization
// ============================================

import { describe, it, expect } from 'vitest';
import { WordAnalysisSchema, validateAIResponse } from '@/modules/ai/schemas/ai-schema';
import { familiarityToQuality, calculateNextReview, getDueCards, getDailyReviewTarget, getSrsProgress, processReviewResults } from '@/modules/vocabulary/services/srs';
import { getFamiliarityColor, getFamiliarityLabel } from '@/shared/utils/utils';

// ============================================
// 1. WordAnalysisSchema 驗證
// ============================================

describe('WordAnalysisSchema', () => {
  it('should accept a valid analysis', () => {
    const input = {
      word: 'ubiquitous',
      partOfSpeech: 'adjective',
      allPartOfSpeech: ['adjective', 'adverb'],
      meaningZh: '無處不在的',
      secondaryMeaningZh: '普遍的',
      exampleSentence: 'Smartphones have become ubiquitous in modern society.',
      exampleZh: '智能手機在現代社會已變得無處不在。',
      synonyms: ['omnipresent', 'pervasive', 'universal'],
      antonyms: ['rare', 'scarce', 'uncommon'],
      collocations: ['ubiquitous presence', 'ubiquitous technology', 'become ubiquitous'],
    };

    const result = WordAnalysisSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.word).toBe('ubiquitous');
      expect(result.data.synonyms).toHaveLength(3);
      expect(result.data.collocations).toHaveLength(3);
    }
  });

  it('should accept minimal valid analysis', () => {
    const input = {
      word: 'hello',
      partOfSpeech: 'interjection',
      allPartOfSpeech: [],
      meaningZh: '你好',
      exampleSentence: 'Hello, how are you?',
      exampleZh: '你好，你好嗎？',
      synonyms: [],
      antonyms: [],
      collocations: [],
    };

    const result = WordAnalysisSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject analysis with empty word', () => {
    const input = {
      word: '',
      partOfSpeech: 'noun',
      allPartOfSpeech: [],
      meaningZh: '測試',
      exampleSentence: 'Test.',
      exampleZh: '測試。',
      synonyms: [],
      antonyms: [],
      collocations: [],
    };

    const result = WordAnalysisSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject analysis with empty meaningZh', () => {
    const input = {
      word: 'test',
      partOfSpeech: 'noun',
      allPartOfSpeech: [],
      meaningZh: '',
      exampleSentence: 'Test.',
      exampleZh: '測試。',
      synonyms: [],
      antonyms: [],
      collocations: [],
    };

    const result = WordAnalysisSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject analysis missing required fields', () => {
    const input = { word: 'test' };
    const result = WordAnalysisSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should handle validateAIResponse wrapper', () => {
    const valid = {
      word: 'meticulous',
      partOfSpeech: 'adjective',
      allPartOfSpeech: ['adjective'],
      meaningZh: '一絲不苟的',
      exampleSentence: 'She is meticulous in her work.',
      exampleZh: '她工作一絲不苟。',
      synonyms: ['careful', 'thorough'],
      antonyms: ['careless'],
      collocations: ['meticulous attention', 'meticulous planning'],
    };

    const result = validateAIResponse(WordAnalysisSchema, valid);
    expect(result.success).toBe(true);
  });

  it('should return error from validateAIResponse for invalid data', () => {
    const result = validateAIResponse(WordAnalysisSchema, { invalid: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('AI 回傳資料格式異常');
    }
  });
});

// ============================================
// 2. SRS Algorithm (existing, but verify vocabulary-specific cases)
// ============================================

describe('SRS for Vocabulary', () => {
  it('should map familiarity to correct quality', () => {
    expect(familiarityToQuality('new')).toBe(0);
    expect(familiarityToQuality('learning')).toBe(2);
    expect(familiarityToQuality('familiar')).toBe(4);
    expect(familiarityToQuality('mastered')).toBe(5);
    expect(familiarityToQuality('unknown')).toBe(0);
  });

  it('should calculate next review for new word', () => {
    const result = calculateNextReview(3); // quality 3 = passed
    expect(result.interval).toBe(1); // first correct: 1 day
    expect(result.repetitions).toBe(1);
    expect(new Date(result.nextReviewDate) > new Date()).toBe(true);
  });

  it('should calculate progressive intervals', () => {
    // Simulate sequence: new -> learning -> familiar -> mastered
    const r1 = calculateNextReview(4, { interval: 0, repetitions: 0, easeFactor: 2.5 });
    expect(r1.interval).toBe(1); // 1d

    const r2 = calculateNextReview(4, { interval: r1.interval, repetitions: r1.repetitions, easeFactor: r1.easeFactor });
    expect(r2.interval).toBe(3); // 3d

    const r3 = calculateNextReview(4, { interval: r2.interval, repetitions: r2.repetitions, easeFactor: r2.easeFactor });
    expect(r3.interval).toBeGreaterThanOrEqual(7); // ~7d (3 * 2.5 ≈ 7.5 → 8)
  });

  it('should reset interval on failure (quality < 3)', () => {
    const result = calculateNextReview(2, { interval: 7, repetitions: 3, easeFactor: 2.5 });
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });

  it('should get due cards correctly', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000).toISOString();
    const tomorrow = new Date(now.getTime() + 86400000).toISOString();

    const cards = [
      { id: '1', nextReviewDate: yesterday },
      { id: '2', nextReviewDate: tomorrow },
      { id: '3', nextReviewDate: null },
    ];

    const due = getDueCards(cards);
    expect(due).toHaveLength(2); // yesterday + null
    expect(due.map(c => c.id)).toEqual(['1', '3']);
  });

  it('should calculate daily review target', () => {
    expect(getDailyReviewTarget(10)).toBe(5);
    expect(getDailyReviewTarget(30)).toBe(10);
    expect(getDailyReviewTarget(60)).toBe(15);
    expect(getDailyReviewTarget(200)).toBe(20);
  });

  it('should calculate SRS progress', () => {
    const result = getSrsProgress(5, 20);
    expect(result.percentage).toBe(75);
    expect(result.labelZh).toBe('快完成了');
    expect(result.labelEn).toBe('Almost done');
    expect(getSrsProgress(0, 0).labelEn).toBe('No reviews due');
  });

  it('should process review results', () => {
    const cards = [
      { id: 'a', easeFactor: 2.5, interval: 0, repetitions: 0 },
      { id: 'b', easeFactor: 2.5, interval: 1, repetitions: 1 },
    ];
    const results = [
      { id: 'a', quality: 4 },
      { id: 'b', quality: 1 },
    ];
    const updated = processReviewResults(results, cards);
    expect(updated[0].repetitions).toBe(1); // a: passed
    expect(updated[1].repetitions).toBe(0); // b: failed, reset
  });
});

// ============================================
// 3. Familiarity UI Helpers
// ============================================

describe('Familiarity UI helpers', () => {
  it('should return correct colors', () => {
    expect(getFamiliarityColor('new')).toContain('red');
    expect(getFamiliarityColor('learning')).toContain('yellow');
    expect(getFamiliarityColor('familiar')).toContain('blue');
    expect(getFamiliarityColor('mastered')).toContain('green');
  });

  it('should return correct labels', () => {
    expect(getFamiliarityLabel('new', 'zh')).toBe('新學');
    expect(getFamiliarityLabel('new', 'en')).toBe('New');
    expect(getFamiliarityLabel('learning', 'zh')).toBe('學習中');
    expect(getFamiliarityLabel('mastered', 'en')).toBe('Mastered');
  });

  it('should handle unknown familiarity gracefully', () => {
    const color = getFamiliarityColor('nonexistent');
    expect(color).toContain('gray');

    const label = getFamiliarityLabel('nonexistent', 'zh');
    expect(label).toBe('nonexistent');
  });
});

// ============================================
// 4. VocabItem Serialization (API → Client)
// ============================================

describe('VocabItem serialization', () => {
  // Simulate the serializeVocab function from the API
  function serializeVocabFields(v: Record<string, unknown>): Record<string, unknown> {
    const result = { ...v };
    for (const field of ['synonyms', 'antonyms', 'collocations', 'allPartOfSpeech']) {
      if (typeof result[field] === 'string') {
        try { result[field] = JSON.parse(result[field] as string); } catch { result[field] = []; }
      }
      if (!result[field]) result[field] = [];
    }
    return result;
  }

  it('should parse JSON string fields to arrays', () => {
    const input = {
      id: '1',
      word: 'test',
      synonyms: '["happy","joyful"]',
      antonyms: '["sad"]',
      collocations: null,
      allPartOfSpeech: '["noun","verb"]',
    };

    const result = serializeVocabFields(input);
    expect(result.synonyms).toEqual(['happy', 'joyful']);
    expect(result.antonyms).toEqual(['sad']);
    expect(result.collocations).toEqual([]);
    expect(result.allPartOfSpeech).toEqual(['noun', 'verb']);
  });

  it('should handle already-parsed arrays', () => {
    const input = {
      id: '1',
      word: 'test',
      synonyms: ['happy'],
      antonyms: null,
      collocations: undefined,
      allPartOfSpeech: [],
    };

    const result = serializeVocabFields(input);
    expect(result.synonyms).toEqual(['happy']);
    expect(result.antonyms).toEqual([]);
    expect(result.collocations).toEqual([]);
  });

  it('should handle malformed JSON gracefully', () => {
    const input = {
      id: '1',
      word: 'test',
      synonyms: 'not-json',
    };

    const result = serializeVocabFields(input);
    expect(result.synonyms).toEqual([]);
  });
});

// ============================================
// 5. Deduplication Logic (API-level, unit test)
// ============================================

describe('Deduplication', () => {
  function isDuplicate(existingWords: Set<string>, word: string): boolean {
    return existingWords.has(word.toLowerCase().trim());
  }

  it('should detect duplicate words case-insensitively', () => {
    const words = new Set(['hello', 'world', 'test']);
    expect(isDuplicate(words, 'Hello')).toBe(true);
    expect(isDuplicate(words, 'HELLO')).toBe(true);
    expect(isDuplicate(words, '  hello  ')).toBe(true);
    expect(isDuplicate(words, 'new')).toBe(false);
  });
});
