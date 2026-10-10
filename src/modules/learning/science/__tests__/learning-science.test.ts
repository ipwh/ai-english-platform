// Sprint 30: AI Learning Science — Unit Tests
import { describe, it, expect } from 'vitest';
import {
  sm2NextReview, createSRSState, isDueForReview, getDueItems,
  forgettingCurve, generateForgettingCurve, optimalReviewTime, 
  scheduleRetrievalPractice, updateRetrievalStrength,
  generateInterleavingPlan,
  calculateDesirableDifficulty, optimalDifficultyLevel,
  generateMetacognitionPrompts, calculateCalibration,
  estimateMastery,
  generateLearningScienceReport,
} from '../services/learning-science';
import type { SpacedRepetitionState, RetrievalItem } from '../types';

describe('SpacedRepetition', () => {
  it('should create initial SRS state', () => {
    const state = createSRSState('item-1');
    expect(state.interval).toBe(0);
    expect(state.easeFactor).toBe(2.5);
    expect(state.repetitions).toBe(0);
  });

  it('should increase interval on correct recall', () => {
    const state = createSRSState('item-1');
    const after1 = sm2NextReview(state, 4); // Good
    expect(after1.interval).toBe(1);
    const after2 = sm2NextReview(after1, 4);
    expect(after2.interval).toBe(6);
    const after3 = sm2NextReview(after2, 4);
    expect(after3.interval).toBeGreaterThan(6);
  });

  it('should reset on failure (quality < 3)', () => {
    const state = { ...createSRSState('item-1'), interval: 10, repetitions: 3 };
    const after = sm2NextReview(state, 1); // Poor recall
    expect(after.interval).toBe(1);
    expect(after.repetitions).toBe(0);
    expect(after.lapses).toBe(1);
  });

  it('should detect due items', () => {
    const due: SpacedRepetitionState = {
      ...createSRSState('due'), nextReviewAt: new Date(Date.now() - 1000).toISOString(),
      interval: 1, easeFactor: 2.5, repetitions: 1, lastReviewedAt: '', quality: 4, lapses: 0,
    };
    const notDue: SpacedRepetitionState = {
      ...createSRSState('future'), nextReviewAt: new Date(Date.now() + 86400000).toISOString(),
      interval: 1, easeFactor: 2.5, repetitions: 1, lastReviewedAt: '', quality: 4, lapses: 0,
    };
    expect(isDueForReview(due)).toBe(true);
    expect(isDueForReview(notDue)).toBe(false);
  });

  it('getDueItems should prioritize lapsed items', () => {
    const lapsed = { ...createSRSState('l1'), lapses: 3, nextReviewAt: new Date(Date.now() - 1000).toISOString(), interval: 1, easeFactor: 2.5, repetitions: 0, lastReviewedAt: '', quality: 2 } as SpacedRepetitionState;
    const normal = { ...createSRSState('n1'), lapses: 0, nextReviewAt: new Date(Date.now() - 1000).toISOString(), interval: 1, easeFactor: 2.5, repetitions: 1, lastReviewedAt: '', quality: 4 } as SpacedRepetitionState;
    const result = getDueItems([normal, lapsed], 10);
    expect(result[0].itemId).toBe('l1');
  });
});

describe('ForgettingCurve', () => {
  it('should have retention of 1.0 at time 0', () => {
    expect(forgettingCurve(0)).toBe(1);
  });

  it('should decay over time', () => {
    const early = forgettingCurve(10);
    const later = forgettingCurve(60);
    expect(later).toBeLessThan(early);
  });

  it('should generate curve points', () => {
    const curve = generateForgettingCurve(1.0, 1);
    expect(curve.length).toBeGreaterThan(0);
    expect(curve[0].retentionProbability).toBe(1);
  });

  it('should calculate optimal review time', () => {
    const hours = optimalReviewTime(1.0, 0.8);
    expect(hours).toBeGreaterThan(0);
  });
});

describe('RetrievalPractice', () => {
  it('should schedule retrieval practice', () => {
    const items: RetrievalItem[] = [
      { itemId: 'a', question: 'Q1', answer: 'A1', retrievalStrength: 0.2, timesCorrect: 1, timesIncorrect: 3 },
      { itemId: 'b', question: 'Q2', answer: 'A2', retrievalStrength: 0.8, timesCorrect: 5, timesIncorrect: 0 },
    ];
    const session = scheduleRetrievalPractice(items, 'spaced');
    expect(session.items[0].itemId).toBe('a'); // Weakest first
  });

  it('should update retrieval strength on correct', () => {
    const item: RetrievalItem = { itemId: 'a', question: 'Q', answer: 'A', retrievalStrength: 0.5, timesCorrect: 1, timesIncorrect: 1 };
    const updated = updateRetrievalStrength(item, true);
    expect(updated.retrievalStrength).toBeGreaterThan(0.5);
  });

  it('should decrease on incorrect', () => {
    const item: RetrievalItem = { itemId: 'a', question: 'Q', answer: 'A', retrievalStrength: 0.5, timesCorrect: 2, timesIncorrect: 0 };
    const updated = updateRetrievalStrength(item, false);
    expect(updated.retrievalStrength).toBeLessThan(0.5);
  });
});

describe('Interleaving', () => {
  it('should alternate topics', () => {
    const plan = generateInterleavingPlan(['grammar', 'vocabulary', 'reading'], { grammar: 3, vocabulary: 2, reading: 2 });
    expect(plan.sequence.length).toBe(7);
    expect(plan.rationale.length).toBeGreaterThan(50);
  });
});

describe('DesirableDifficulty', () => {
  it('should increase difficulty when accuracy is high', () => {
    const config = calculateDesirableDifficulty(0.9, 0.88);
    expect(config.adjustment).toBe('increase');
    expect(config.suggestedDifficulty).toBe('challenge');
  });

  it('should decrease difficulty when accuracy is low', () => {
    const config = calculateDesirableDifficulty(0.4, 0.42);
    expect(config.adjustment).toBe('decrease');
    expect(config.suggestedDifficulty).toBe('remedial');
  });

  it('should determine optimal level from mastery', () => {
    const level = optimalDifficultyLevel(75, 7);
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(5);
  });
});

describe('Metacognition', () => {
  it('should generate prompts', () => {
    const prompts = generateMetacognitionPrompts('Tenses', '時態');
    expect(prompts.beforePractice.length).toBe(4);
    expect(prompts.afterPractice.length).toBe(4);
  });

  it('should detect overconfidence', () => {
    const result = calculateCalibration(5, 0.5);
    expect(result.overconfident).toBe(true);
    expect(result.calibrationGap).toBeGreaterThan(0.1);
  });

  it('should detect underconfidence', () => {
    const result = calculateCalibration(1, 0.8);
    expect(result.calibrationGap).toBeLessThan(0);
  });

  it('should give positive feedback for good calibration', () => {
    const result = calculateCalibration(3, 0.5); // 3→0.5 normalized, gap ≈ 0
    expect(Math.abs(result.calibrationGap)).toBeLessThanOrEqual(0.1);
  });
});

describe('ConfidenceBasedMastery', () => {
  it('should estimate mastery from evidence', () => {
    const evidence = [
      { correct: true, difficulty: 2 },
      { correct: true, difficulty: 3 },
      { correct: false, difficulty: 4 },
      { correct: true, difficulty: 2 },
      { correct: true, difficulty: 1 },
    ];
    const result = estimateMastery(0.5, evidence);
    expect(result.estimatedMastery).toBeGreaterThan(0.5);
    expect(result.estimatedMastery).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.evidenceStrength).toBe(5);
  });

  it('should flag mastery when criteria met', () => {
    const evidence = [
      { correct: true, difficulty: 1 },
      { correct: true, difficulty: 1 },
      { correct: true, difficulty: 1 },
      { correct: true, difficulty: 1 },
      { correct: true, difficulty: 1 },
    ];
    const result = estimateMastery(0.85, evidence);
    // With 5 correct answers and high prior, should reach mastery
    expect(result.estimatedMastery).toBeGreaterThan(0.8);
    expect(result.evidenceStrength).toBeGreaterThanOrEqual(3);
  });

  it('should start with high uncertainty', () => {
    const result = estimateMastery(0.5, []);
    expect(result.confidence).toBeLessThan(0.2);
    expect(result.isMastered).toBe(false);
  });
});

describe('LearningScienceReport', () => {
  it('should generate comprehensive report', () => {
    const report = generateLearningScienceReport('s1', [], [], 0.1, []);
    expect(report.studentId).toBe('s1');
    expect(report.forgettingCurve.averageRetention).toBeGreaterThanOrEqual(0);
    expect(report.retrievalStrength).toBeDefined();
    expect(report.masteryConfidence).toBeDefined();
    expect(report.recommendations).toBeDefined();
  });
});

// ============================================
// Sprint 33: Learning Science Engine tests
// ============================================

import { ReviewScheduler } from '../services/review-scheduler';
import { DifficultyAdjuster } from '../services/difficulty-adjuster';
import { ConfidenceEstimator } from '../services/confidence-estimator';
import { LearningEffectivenessAnalyzer } from '../services/effectiveness-analyzer';
import { ReflectionGenerator } from '../services/reflection-generator';
import type { ReviewScheduleEntry } from '../types';

function makeEntry(overrides: Partial<ReviewScheduleEntry> = {}): ReviewScheduleEntry {
  return {
    studentId: 's1',
    itemId: 'item-1',
    itemType: 'vocabulary',
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    quality: 0,
    estimatedMastery: 0,
    masteryConfidence: 0,
    evidenceCount: 0,
    isMastered: false,
    currentDifficulty: 'core',
    difficultyAdjustment: 'maintain',
    adaptiveFactor: 1.0,
    retrievalStrength: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    reviewStrength: 1.0,
    retentionProbability: 1.0,
    nextReviewAt: new Date().toISOString(),
    reviewPriority: 0,
    reviewUrgency: 'low',
    ...overrides,
  };
}

describe('ReviewScheduler', () => {
  const scheduler = new ReviewScheduler();

  it('should create a fresh entry with defaults', () => {
    const entry = scheduler.createEntry('s1', 'node-1', 'knowledge-node', {
      skillDimension: 'grammar',
      title: 'Tenses',
      titleZh: '時態',
    });
    expect(entry.studentId).toBe('s1');
    expect(entry.itemId).toBe('node-1');
    expect(entry.interval).toBe(0);
    expect(entry.easeFactor).toBe(2.5);
    expect(entry.currentDifficulty).toBe('core');
  });

  it('should process a correct review and advance SM-2', () => {
    const entry = makeEntry();
    const result = scheduler.processReview(entry, 4, true);
    expect(result.interval).toBe(1); // First correct → 1 day
    expect(result.repetitions).toBe(1);
    expect(result.retrievalStrength).toBeGreaterThan(0);
    expect(result.reviewPriority).toBeGreaterThan(0);
  });

  it('should process a failed review and reset interval', () => {
    const entry = makeEntry({ interval: 6, repetitions: 3 });
    const result = scheduler.processReview(entry, 1, false);
    expect(result.interval).toBe(1); // Reset on fail
    expect(result.lapses).toBe(1);
    expect(result.retrievalStrength).toBe(0); // Reset
  });

  it('should sort entries by priority', () => {
    const entries = [
      makeEntry({ itemId: 'low', reviewPriority: 0.1 }),
      makeEntry({ itemId: 'high', reviewPriority: 0.9 }),
      makeEntry({ itemId: 'mid', reviewPriority: 0.5 }),
    ];
    const sorted = scheduler.sortByPriority(entries);
    expect(sorted[0].itemId).toBe('high');
    expect(sorted[2].itemId).toBe('low');
  });

  it('should get due entries sorted by priority', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    const entries = [
      makeEntry({ itemId: 'due1', nextReviewAt: past, reviewPriority: 0.3 }),
      makeEntry({ itemId: 'due2', nextReviewAt: past, reviewPriority: 0.8, lapses: 2 }),
      makeEntry({ itemId: 'not-due', nextReviewAt: future }),
    ];
    const due = scheduler.getDueEntries(entries);
    expect(due).toHaveLength(2);
    expect(due[0].itemId).toBe('due2'); // Higher priority first
  });

  it('should predict retention from forgetting curve', () => {
    const entry = makeEntry({ reviewStrength: 2.0, lastReviewedAt: new Date(Date.now() - 60000).toISOString() });
    const retention = scheduler.predictRetention(entry);
    expect(retention).toBeGreaterThan(0);
    expect(retention).toBeLessThanOrEqual(1);
  });
});

describe('DifficultyAdjuster', () => {
  const adjuster = new DifficultyAdjuster();

  it('should suggest challenge when accuracy is high', () => {
    const entry = makeEntry({ timesCorrect: 9, timesIncorrect: 1 });
    const result = adjuster.adjust(entry, 0.90, 0.90);
    expect(result.difficulty).toBe('challenge');
    expect(result.direction).toBe('increase');
  });

  it('should suggest remedial when accuracy is low', () => {
    const entry = makeEntry({ timesCorrect: 2, timesIncorrect: 8 });
    const result = adjuster.adjust(entry, 0.20, 0.20);
    expect(result.difficulty).toBe('remedial');
    expect(result.direction).toBe('decrease');
  });

  it('should detect optimal difficulty zone', () => {
    expect(adjuster.isOptimalDifficulty(0.75)).toBe(true);
    expect(adjuster.isOptimalDifficulty(0.90)).toBe(false);
    expect(adjuster.isOptimalDifficulty(0.50)).toBe(false);
  });

  it('should calculate optimal level from entries', () => {
    const entries = [
      makeEntry({ itemId: 'a', timesCorrect: 9, timesIncorrect: 1 }),
      makeEntry({ itemId: 'b', timesCorrect: 9, timesIncorrect: 1 }),
    ];
    expect(adjuster.calculateOptimalLevel(entries)).toBe('challenge');
  });

  it('should get ZPD distribution', () => {
    const entries = [
      makeEntry({ currentDifficulty: 'remedial', timesCorrect: 3, timesIncorrect: 0 }),
      makeEntry({ currentDifficulty: 'core', timesCorrect: 7, timesIncorrect: 3 }),
      makeEntry({ currentDifficulty: 'core', timesCorrect: 8, timesIncorrect: 2 }),
    ];
    const zpd = adjuster.getZPD(entries);
    expect(zpd.remedial).toBeGreaterThan(0);
    expect(zpd.core).toBeGreaterThan(0);
    expect(zpd.recommended).toBeDefined();
  });

  it('should apply adjustments to all entries', () => {
    const entries = [
      makeEntry({ itemId: 'a', timesCorrect: 9, timesIncorrect: 1 }),
      makeEntry({ itemId: 'b', timesCorrect: 2, timesIncorrect: 8 }),
    ];
    const adjusted = adjuster.applyAdjustments(entries);
    expect(adjusted[0].currentDifficulty).toBe('challenge');
    expect(adjusted[1].currentDifficulty).toBe('remedial');
  });
});

describe('ConfidenceEstimator', () => {
  const estimator = new ConfidenceEstimator();

  it('should increase mastery on correct answers', () => {
    const entry = makeEntry({ evidenceCount: 2, timesCorrect: 1, timesIncorrect: 1 });
    const result = estimator.updateMastery(entry, true, 3);
    expect(result.estimatedMastery).toBeGreaterThan(0);
    expect(result.evidenceCount).toBe(3);
  });

  it('should decrease mastery on incorrect answers', () => {
    const entry = makeEntry({ evidenceCount: 4, timesCorrect: 3, timesIncorrect: 1, estimatedMastery: 0.8 });
    const result = estimator.updateMastery(entry, false, 3);
    expect(result.estimatedMastery).toBeLessThan(0.8);
  });

  it('should flag mastery when criteria met', () => {
    const entry = makeEntry({ estimatedMastery: 0.85, evidenceCount: 5, timesCorrect: 5, timesIncorrect: 0 });
    const result = estimator.updateMastery(entry, true, 1);
    expect(result.isMastered).toBe(true);
  });

  it('should not flag mastery without sufficient evidence', () => {
    const entry = makeEntry({ estimatedMastery: 0.9, evidenceCount: 1, timesCorrect: 1, timesIncorrect: 0 });
    const result = estimator.updateMastery(entry, true, 1);
    expect(result.isMastered).toBe(false);
  });

  it('should estimate time to mastery', () => {
    const entry = makeEntry({ estimatedMastery: 0.5, evidenceCount: 4, interval: 2 });
    const result = estimator.estimateTimeToMastery(entry);
    expect(result).toBeGreaterThan(0);
  });

  it('should return 0 for already mastered items', () => {
    const entry = makeEntry({ isMastered: true });
    expect(estimator.estimateTimeToMastery(entry)).toBe(0);
  });

  it('should classify mastery distribution', () => {
    const entries = [
      makeEntry({ itemId: 'a', isMastered: true, masteryConfidence: 0.8 }),
      makeEntry({ itemId: 'b', estimatedMastery: 0.5, isMastered: false }),
      makeEntry({ itemId: 'c', estimatedMastery: 0.1, isMastered: false }),
    ];
    const dist = estimator.getMasteryDistribution(entries);
    expect(dist.mastered).toBe(1);
    expect(dist.learning).toBe(1);
    expect(dist.unknown).toBe(1);
  });
});

describe('LearningEffectivenessAnalyzer', () => {
  const analyzer = new LearningEffectivenessAnalyzer();
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  it('should generate an effectiveness report', () => {
    const entries = [
      makeEntry({ itemId: 'a', retentionProbability: 0.8, estimatedMastery: 0.7, isMastered: true, lastReviewedAt: yesterday }),
      makeEntry({ itemId: 'b', retentionProbability: 0.4, estimatedMastery: 0.3, isMastered: false, lastReviewedAt: yesterday }),
    ];
    const report = analyzer.analyze('s1', entries, yesterday, now);
    expect(report.studentId).toBe('s1');
    expect(report.metrics.averageRetention).toBeGreaterThan(0);
    expect(report.metrics.itemsMastered).toBe(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendationsZh.length).toBeGreaterThan(0);
  });

  it('should detect declining retention trend', () => {
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    const recent = new Date(Date.now() - 86400000).toISOString();

    const entries = [
      makeEntry({ itemId: 'a', retentionProbability: 0.9, lastReviewedAt: old }),
      makeEntry({ itemId: 'b', retentionProbability: 0.9, lastReviewedAt: old }),
      makeEntry({ itemId: 'c', retentionProbability: 0.3, lastReviewedAt: recent }),
      makeEntry({ itemId: 'd', retentionProbability: 0.3, lastReviewedAt: recent }),
    ];
    const report = analyzer.analyze('s1', entries, old, now);
    expect(report.metrics.retentionTrend).toBe('declining');
  });
});

describe('ReflectionGenerator', () => {
  const generator = new ReflectionGenerator();

  it('should generate before-practice prompts', () => {
    const entries = [makeEntry({ title: 'Past Tense' })];
    const prompts = generator.beforePractice(entries, 2);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('Past Tense');
  });

  it('should generate after-practice prompts', () => {
    const entries = [makeEntry({ title: 'Past Tense' })];
    const prompts = generator.afterPractice(entries, 3);
    expect(prompts).toHaveLength(3);
  });

  it('should generate Chinese prompts', () => {
    const entries = [makeEntry({ titleZh: '過去式' })];
    const prompts = generator.beforePractice(entries, 1, 'zh');
    expect(prompts[0]).toContain('過去式');
  });

  it('should generate per-item reflections based on state', () => {
    const lapsed = makeEntry({ itemId: 'a', title: 'A', lapses: 3 });
    const mastered = makeEntry({ itemId: 'b', title: 'B', isMastered: true, masteryConfidence: 0.8 });
    const weak = makeEntry({ itemId: 'c', title: 'C', retrievalStrength: 0.1 });

    expect(generator.generateItemReflection(lapsed)).toContain('3 times');
    expect(generator.generateItemReflection(mastered)).toContain('mastered');
    expect(generator.generateItemReflection(weak)).toContain('low');
  });

  it('should generate session reflections', () => {
    const entries = [makeEntry({ title: 'Tenses', itemId: 'a' })];
    const result = generator.generateSessionReflections(entries);
    expect(result.before.length).toBeGreaterThan(0);
    expect(result.after.length).toBeGreaterThan(0);
    expect(result.perItem['a']).toBeDefined();
  });
});
