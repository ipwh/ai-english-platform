// Sprint 9: Mistake Database Tests
import { describe, it, expect } from 'vitest';
import type { MistakeRecord } from '../types';
import {
  classifySeverity, extractGrammarPoint, calculateNextReview,
  getDueForReview, estimateCategoryMastery,
} from '../services/mistake-tracker';
import { analyzeMistakes, summarizeStats } from '../services/mistake-analytics';
import { generateMistakeRecommendations } from '../services/mistake-recommendation';

function makeMistake(overrides: Partial<MistakeRecord> = {}): MistakeRecord {
  return {
    id: 'm1', studentId: 's1', questionId: 'q1',
    questionSummary: 'Simple past tense question',
    studentAnswer: 'goed', correctAnswer: 'went',
    category: 'grammar', reviewed: false,
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================
// Mistake Tracker Tests
// ============================================

describe('MistakeTracker', () => {
  it('should classify severity correctly', () => {
    expect(classifySeverity('grammar')).toBe('major');
    expect(classifySeverity('vocabulary')).toBe('minor');
    expect(classifySeverity('comprehension')).toBe('critical');
    expect(classifySeverity('careless')).toBe('minor');
    expect(classifySeverity('time-management')).toBe('major');
    expect(classifySeverity('chinglish')).toBe('major');
  });

  it('should extract grammar points from question summary', () => {
    expect(extractGrammarPoint('Present perfect tense exercise')).toBe('tenses');
    expect(extractGrammarPoint('Passive voice transformation')).toBe('passive-voice');
    expect(extractGrammarPoint('Type 2 conditional practice')).toBe('conditionals');
    expect(extractGrammarPoint('Relative clause with who and which')).toBe('relative-clauses');
    expect(extractGrammarPoint('Reported speech conversion')).toBe('reported-speech');
    expect(extractGrammarPoint('Random vocabulary question')).toBe('general');
  });

  it('should calculate SRS next review dates', () => {
    const result = calculateNextReview(0, 2.5, 4);
    expect(result.interval).toBe(1);
    expect(result.nextDate.getTime()).toBeGreaterThan(Date.now());

    const result2 = calculateNextReview(3, 2.5, 5);
    expect(result2.interval).toBeGreaterThanOrEqual(7);

    const result3 = calculateNextReview(10, 2.5, 1);
    expect(result3.interval).toBe(1); // Reset on poor quality
  });

  it('should filter mistakes due for review', () => {
    const past = new Date(); past.setDate(past.getDate() - 2);
    const future = new Date(); future.setDate(future.getDate() + 7);
    const mistakes = [
      makeMistake({ id: 'm1', reviewed: false, nextReviewDate: past }),
      makeMistake({ id: 'm2', reviewed: false, nextReviewDate: future }),
      makeMistake({ id: 'm3', reviewed: true, nextReviewDate: past }),
    ];
    const due = getDueForReview(mistakes);
    expect(due.length).toBe(1);
    expect(due[0].id).toBe('m1');
  });

  it('should estimate category mastery', () => {
    const mistakes = [
      makeMistake({ category: 'grammar', reviewed: true }),
      makeMistake({ category: 'grammar', reviewed: true }),
      makeMistake({ category: 'grammar', reviewed: false }),
    ];
    const mastery = estimateCategoryMastery(mistakes, 'grammar');
    expect(mastery).toBeGreaterThan(80);
  });
});

// ============================================
// Mistake Analytics Tests
// ============================================

describe('MistakeAnalytics', () => {
  it('should analyze mistake records into stats', () => {
    const mistakes: MistakeRecord[] = [
      makeMistake({ id: 'm1', category: 'grammar', questionSummary: 'Passive voice question', reviewed: true }),
      makeMistake({ id: 'm2', category: 'grammar', questionSummary: 'Passive voice again', reviewed: false }),
      makeMistake({ id: 'm3', category: 'grammar', questionSummary: 'Present perfect tense' }),
      makeMistake({ id: 'm4', category: 'vocabulary', questionSummary: 'collocation error' }),
      makeMistake({ id: 'm5', category: 'comprehension', questionSummary: 'misunderstood passage' }),
    ];
    const stats = analyzeMistakes(mistakes, 20);

    expect(stats.totalMistakes).toBe(5);
    expect(stats.reviewedCount).toBe(1);
    expect(stats.pendingReviewCount).toBe(4);
    expect(stats.byCategory.grammar.count).toBe(3);
    expect(stats.byCategory.grammar.percentage).toBe(60);
    expect(stats.byCategory.vocabulary.count).toBe(1);
    expect(stats.topGrammarPoints.length).toBeGreaterThan(0);
    expect(stats.mistakesPerSession).toBe(0.3);
  });

  it('should handle empty mistakes', () => {
    const stats = analyzeMistakes([], 0);
    expect(stats.totalMistakes).toBe(0);
    expect(stats.byCategory.grammar.count).toBe(0);
  });

  it('should generate a summary string', () => {
    const mistakes: MistakeRecord[] = [
      makeMistake({ category: 'grammar', questionSummary: 'Passive voice' }),
      makeMistake({ category: 'grammar', questionSummary: 'Passive voice' }),
      makeMistake({ category: 'vocabulary' }),
    ];
    const stats = analyzeMistakes(mistakes, 10);
    const summary = summarizeStats(stats);
    expect(summary).toContain('3');
    expect(summary).toContain('文法');
  });
});

// ============================================
// Mistake Recommendation Tests
// ============================================

describe('MistakeRecommendation', () => {
  it('should generate recommendations for grammar issues', () => {
    const past = new Date(); past.setDate(past.getDate() - 2);
    const mistakes: MistakeRecord[] = Array.from({ length: 5 }, (_, i) =>
      makeMistake({
        id: `m${i}`,
        category: 'grammar',
        questionSummary: 'Passive voice transformation',
        nextReviewDate: past,
      })
    );
    const recs = generateMistakeRecommendations(mistakes, 10);

    expect(recs.length).toBeGreaterThan(0);
    // First should be due review
    expect(recs[0].type).toBe('review');
    expect(recs[0].priority).toBe('high');
    // Should also have grammar practice recommendation
    const grammarRec = recs.find(r => r.type === 'practice' && r.category === 'grammar');
    expect(grammarRec).toBeDefined();
  });

  it('should recommend comprehension lessons', () => {
    const mistakes: MistakeRecord[] = Array.from({ length: 4 }, (_, i) =>
      makeMistake({ id: `m${i}`, category: 'comprehension' })
    );
    const recs = generateMistakeRecommendations(mistakes, 10);
    const compRec = recs.find(r => r.category === 'comprehension');
    expect(compRec).toBeDefined();
    expect(compRec!.type).toBe('lesson');
    expect(compRec!.priority).toBe('high');
  });

  it('should limit to 5 recommendations', () => {
    const mistakes: MistakeRecord[] = Array.from({ length: 20 }, (_, i) =>
      makeMistake({ id: `m${i}`, category: 'grammar', questionSummary: `grammar point ${i % 5}` })
    );
    const recs = generateMistakeRecommendations(mistakes, 10);
    expect(recs.length).toBeLessThanOrEqual(5);
  });

  it('should handle empty mistakes', () => {
    const recs = generateMistakeRecommendations([], 0);
    expect(recs.length).toBe(0);
  });
});
