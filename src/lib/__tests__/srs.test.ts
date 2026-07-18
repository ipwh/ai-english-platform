// ============================================
// Tests: SRS (SM-2 Algorithm) & Vocabulary Utilities
// ============================================

import { describe, it, expect } from 'vitest';
import {
  calculateNextReview,
  familiarityToQuality,
  getDueCards,
  getDailyReviewTarget,
} from '@/modules/vocabulary/services/srs';
import { serializeVocab } from '@/shared/utils/utils';

// ============================================
// SM-2 Algorithm Tests
// ============================================

describe('calculateNextReview', () => {
  it('should set interval=1 for first correct review (quality=5)', () => {
    const result = calculateNextReview(5);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it('should set interval=3 for second correct review (quality=4)', () => {
    const result = calculateNextReview(4, { repetitions: 1, interval: 1, easeFactor: 2.5 });
    expect(result.interval).toBe(3);
    expect(result.repetitions).toBe(2);
  });

  it('should multiply interval by easeFactor for third+ correct review', () => {
    const result = calculateNextReview(5, { repetitions: 2, interval: 3, easeFactor: 2.5 });
    expect(result.interval).toBe(8); // Math.round(3 * 2.5) = 8
    expect(result.repetitions).toBe(3);
  });

  it('should reset on failure (quality < 3)', () => {
    const result = calculateNextReview(1, { repetitions: 3, interval: 14, easeFactor: 2.5 });
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });

  it('should decrease easeFactor on poor recall', () => {
    const result = calculateNextReview(1, { easeFactor: 2.5, interval: 1, repetitions: 0 });
    // quality=1: EF = 2.5 + (0.1 - (4)*(0.08+4*0.02)) = 2.5 + (0.1 - 4*0.16) = 2.5 + (0.1-0.64) = 1.96
    expect(result.easeFactor).toBeCloseTo(1.96, 1);
  });

  it('should increase easeFactor on perfect recall', () => {
    const result = calculateNextReview(5, { easeFactor: 2.5, interval: 1, repetitions: 0 });
    // quality=5: EF = 2.5 + (0.1 - 0) = 2.6
    expect(result.easeFactor).toBe(2.6);
  });

  it('should floor easeFactor at 1.3 minimum', () => {
    const result = calculateNextReview(0, { easeFactor: 1.3, interval: 1, repetitions: 0 });
    // quality=0: EF = 1.3 + (0.1 - (5)*(0.08+5*0.02)) = 1.3 + (0.1 - 5*0.18) = 1.3 + (0.1-0.9) = 0.5
    expect(result.easeFactor).toBe(1.3); // clamped
  });

  it('should return ISO date strings', () => {
    const result = calculateNextReview(3);
    expect(result.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.nextReviewDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // next review should be after last review
    expect(new Date(result.nextReviewDate).getTime()).toBeGreaterThanOrEqual(
      new Date(result.lastReviewedAt).getTime()
    );
  });

  it('should handle default empty current state', () => {
    const result = calculateNextReview(4);
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it('should handle quality=3 as passing (threshold)', () => {
    const result = calculateNextReview(3, { repetitions: 1, interval: 1, easeFactor: 2.5 });
    expect(result.repetitions).toBeGreaterThan(0);
    expect(result.interval).toBeGreaterThanOrEqual(3);
  });
});

// ============================================
// Familiarity → Quality Mapping
// ============================================

describe('familiarityToQuality', () => {
  it('should map "new" → 0', () => expect(familiarityToQuality('new')).toBe(0));
  it('should map "learning" → 2', () => expect(familiarityToQuality('learning')).toBe(2));
  it('should map "familiar" → 4', () => expect(familiarityToQuality('familiar')).toBe(4));
  it('should map "mastered" → 5', () => expect(familiarityToQuality('mastered')).toBe(5));
  it('should default unknown values → 0', () => expect(familiarityToQuality('invalid')).toBe(0));
});

// ============================================
// Due Cards Retrieval
// ============================================

describe('getDueCards', () => {
  const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
  const futureDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow

  it('should return cards with past nextReviewDate', () => {
    const cards = [
      { id: '1', nextReviewDate: pastDate },
      { id: '2', nextReviewDate: futureDate },
    ];
    const due = getDueCards(cards);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('1');
  });

  it('should return cards with null nextReviewDate (unscheduled)', () => {
    const cards = [
      { id: '1', nextReviewDate: null },
      { id: '2', nextReviewDate: futureDate },
    ];
    const due = getDueCards(cards);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('1');
  });

  it('should return empty for all future cards', () => {
    const cards = [
      { id: '1', nextReviewDate: futureDate },
      { id: '2', nextReviewDate: futureDate },
    ];
    expect(getDueCards(cards)).toHaveLength(0);
  });
});

// ============================================
// Daily Review Target
// ============================================

describe('getDailyReviewTarget', () => {
  it('should return 5 for small vocab (≤20)', () => {
    expect(getDailyReviewTarget(10)).toBe(5);
    expect(getDailyReviewTarget(20)).toBe(5);
  });

  it('should return 10 for medium vocab (≤50)', () => {
    expect(getDailyReviewTarget(30)).toBe(10);
    expect(getDailyReviewTarget(50)).toBe(10);
  });

  it('should return 15 for large vocab (≤100)', () => {
    expect(getDailyReviewTarget(60)).toBe(15);
    expect(getDailyReviewTarget(100)).toBe(15);
  });

  it('should return 20 for very large vocab (>100)', () => {
    expect(getDailyReviewTarget(200)).toBe(20);
  });

  it('should cap at totalCards for very small vocab', () => {
    expect(getDailyReviewTarget(3)).toBe(3);
  });
});

// ============================================
// serializeVocab Utility
// ============================================

describe('serializeVocab', () => {
  it('should parse JSON string fields to arrays', () => {
    const input = {
      id: '1',
      word: 'test',
      synonyms: '["example","sample"]',
      antonyms: '[]',
      collocations: '["take a test"]',
      allPartOfSpeech: '["noun"]',
      masteryLevel: 3,
    };
    const result = serializeVocab(input);
    expect(result.synonyms).toEqual(['example', 'sample']);
    expect(result.antonyms).toEqual([]);
    expect(result.collocations).toEqual(['take a test']);
    expect(result.allPartOfSpeech).toEqual(['noun']);
  });

  it('should handle already-parsed arrays', () => {
    const input = {
      id: '1',
      word: 'test',
      synonyms: ['example'],
      antonyms: null,
      collocations: undefined,
      allPartOfSpeech: '',
    };
    const result = serializeVocab(input);
    expect(result.synonyms).toEqual(['example']);
    expect(result.antonyms).toEqual([]);
    expect(result.collocations).toEqual([]);
    expect(result.allPartOfSpeech).toEqual([]);
  });

  it('should handle invalid JSON gracefully', () => {
    const input = {
      id: '1',
      word: 'test',
      synonyms: 'not-json',
    };
    const result = serializeVocab(input);
    expect(result.synonyms).toEqual([]);
  });

  it('should preserve non-JSON fields unchanged', () => {
    const input = {
      id: '1',
      word: 'perseverance',
      meaningZh: '毅力',
      masteryLevel: 4,
    };
    const result = serializeVocab(input);
    expect(result.word).toBe('perseverance');
    expect(result.meaningZh).toBe('毅力');
    expect(result.masteryLevel).toBe(4);
  });
});
