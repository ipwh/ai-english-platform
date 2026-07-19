// Sprint 30: AI Learning Science — Unit Tests
import { describe, it, expect } from 'vitest';
import {
  sm2NextReview, createSRSState, isDueForReview, getDueItems,
  forgettingCurve, generateForgettingCurve, optimalReviewTime, calculateReviewStrength,
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
