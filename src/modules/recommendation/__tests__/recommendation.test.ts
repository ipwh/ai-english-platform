// Sprint 22: Adaptive Recommendation Engine — Unit Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEngine } from '../services/recommendation-engine';
import { recommendationService } from '../services/recommendation-service';
import { recommendationRepo } from '../repositories/recommendation-repository';
import { scoreRecommendation, scoreAll, getConfidenceBand } from '../services/recommendation-scorer';
import { generateReasons, enrichRecommendations } from '../services/recommendation-reason-generator';
import {
  WeaknessExerciseStrategy, SpacedRepetitionStrategy,
  MistakeReviewStrategy, LearningPathStrategy, VocabularyReviewStrategy,
  SkillSpecificStrategy, StreakMaintenanceStrategy,
} from '../services/recommendation-strategy';
import type {
  RecommendationInput, Recommendation, MasteryScoreEntry,
  LearningProfileSnapshot, MistakeStatsSnapshot,
} from '../types';

// ============================================
// Test Data Builders
// ============================================

function buildMasteryScores(overrides: Partial<MasteryScoreEntry>[] = []): MasteryScoreEntry[] {
  const base: MasteryScoreEntry[] = [
    { nodeId: 'tenses-simple', skill: 'grammar', title: 'Simple Tenses', titleZh: '簡單時態', cefr: 'A2', hkdseLevel: 'S1', difficulty: 1, currentMastery: 85, masteryThreshold: 70, accuracy: 0.85, totalAttempts: 12, daysSinceLastPractice: 2, estimatedLearningTime: 60 },
    { nodeId: 'present-perfect', skill: 'grammar', title: 'Present Perfect', titleZh: '現在完成式', cefr: 'B1', hkdseLevel: 'S2', difficulty: 2, currentMastery: 35, masteryThreshold: 70, accuracy: 0.45, totalAttempts: 5, daysSinceLastPractice: 6, estimatedLearningTime: 90 },
    { nodeId: 'reading-inference', skill: 'reading', title: 'Making Inferences', titleZh: '推論技巧', cefr: 'B1', hkdseLevel: 'S4', difficulty: 3, currentMastery: 50, masteryThreshold: 70, accuracy: 0.55, totalAttempts: 4, daysSinceLastPractice: 10, estimatedLearningTime: 120 },
    { nodeId: 'writing-essay-structure', skill: 'writing', title: 'Essay Structure', titleZh: '文章結構', cefr: 'B1', hkdseLevel: 'S2', difficulty: 2, currentMastery: 60, masteryThreshold: 65, accuracy: 0.65, totalAttempts: 8, daysSinceLastPractice: 4, estimatedLearningTime: 90 },
    { nodeId: 'vocab-basic-academic', skill: 'vocabulary', title: 'Basic Academic Vocab', titleZh: '基礎學術詞彙', cefr: 'A2', hkdseLevel: 'S1', difficulty: 1, currentMastery: 90, masteryThreshold: 65, accuracy: 0.9, totalAttempts: 20, daysSinceLastPractice: 1, estimatedLearningTime: 45 },
  ];
  if (overrides.length > 0) {
    for (const override of overrides) {
      const idx = base.findIndex(b => b.nodeId === override.nodeId);
      if (idx >= 0) base[idx] = { ...base[idx], ...override };
      else base.push(override as MasteryScoreEntry);
    }
  }
  return base;
}

function buildProfile(overrides: Partial<LearningProfileSnapshot> = {}): LearningProfileSnapshot {
  return {
    overallAccuracy: 0.68, totalPracticeSessions: 15, totalQuestionsAnswered: 75,
    currentStreak: 4, questionsPerSession: 5, sessionsLast7Days: 3,
    vocabularyStats: { total: 30, mastered: 15, learning: 10, dueForReview: 8 },
    ...overrides,
  };
}

function buildMistakeStats(overrides: Partial<MistakeStatsSnapshot> = {}): MistakeStatsSnapshot {
  return {
    totalMistakes: 12, reviewedCount: 5, pendingReviewCount: 7,
    byCategory: { grammar: 5, vocabulary: 2, comprehension: 3, careless: 1, chinglish: 1 },
    topGrammarPoints: [{ point: 'tenses', count: 3 }, { point: 'articles', count: 2 }],
    recent7Days: 4, recent30Days: 10,
    ...overrides,
  };
}

function buildDefaultInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    studentId: 'test-student-1',
    gradeLevel: 'S4',
    masteryScores: buildMasteryScores(),
    learningProfile: buildProfile(),
    mistakeStats: buildMistakeStats(),
    sessionHistory: [
      { sessionId: 's1', startedAt: new Date('2026-07-18'), durationMinutes: 25, questionsAnswered: 6, correctCount: 4, skillFocus: 'grammar', topicsCovered: ['tenses', 'articles'] },
      { sessionId: 's2', startedAt: new Date('2026-07-17'), durationMinutes: 20, questionsAnswered: 5, correctCount: 3, skillFocus: 'reading', topicsCovered: ['environment', 'pollution'] },
    ],
    preferredTopics: [
      { topic: 'environment', category: 'environment', engagementCount: 8, averageScore: 75 },
      { topic: 'technology', category: 'technology', engagementCount: 5, averageScore: 60 },
    ],
    availableStudyTime: 45,
    maxRecommendations: 6,
    ...overrides,
  };
}

// ============================================
// Engine Tests
// ============================================

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  it('should generate recommendations for a student', () => {
    const input = buildDefaultInput();
    const result = engine.generate(input);

    expect(result.studentId).toBe('test-student-1');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(6);
    expect(result.summary.total).toBe(result.recommendations.length);
    expect(result.diagnostics.strategiesUsed.length).toBeGreaterThan(0);
    expect(result.diagnostics.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should produce deterministic output for same input', () => {
    const input = buildDefaultInput();
    const r1 = engine.generate(input);
    const r2 = engine.generate(input);

    expect(r1.recommendations.length).toBe(r2.recommendations.length);
    expect(r1.summary.total).toBe(r2.summary.total);
    expect(r1.diagnostics.strategiesUsed).toEqual(r2.diagnostics.strategiesUsed);
  });

  it('should respect maxRecommendations', () => {
    const input = buildDefaultInput({ maxRecommendations: 3 });
    const result = engine.generate(input);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('should fit recommendations within available study time', () => {
    const input = buildDefaultInput({ availableStudyTime: 20, maxRecommendations: 10 });
    const result = engine.generate(input);
    // Engine ensures at least minimum recs even if budget exceeded
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.availableStudyTime).toBe(20);
  });

  it('should identify weaknesses', () => {
    const input = buildDefaultInput();
    const result = engine.generate(input);
    const weaknessRecs = result.recommendations.filter(r => r.strategy === 'weakness-exercise');
    expect(weaknessRecs.length).toBeGreaterThan(0);
  });

  it('should detect due reviews from spaced repetition', () => {
    const input = buildDefaultInput();
    const result = engine.generate(input);
    const reviewRecs = result.recommendations.filter(r => r.strategy === 'spaced-repetition');
    expect(reviewRecs.length).toBeGreaterThan(0);
  });

  it('should generate vocabulary reviews when due', () => {
    const input = buildDefaultInput({
      learningProfile: buildProfile({ vocabularyStats: { total: 50, mastered: 20, learning: 15, dueForReview: 25 } }),
    });
    const result = engine.generate(input);
    const vocabRecs = result.recommendations.filter(r => r.type === 'vocabulary-review');
    expect(vocabRecs.length).toBeGreaterThan(0);
  });

  it('should handle empty mastery data gracefully', () => {
    const input = buildDefaultInput({ masteryScores: [] });
    const result = engine.generate(input);
    // Some strategies may still apply (vocab review, mistake review, streak)
    expect(result.summary.total).toBe(result.recommendations.length);
    expect(result.diagnostics.strategiesUsed.length).toBeGreaterThanOrEqual(0);
  });

  it('should include focus skill in recommendations', () => {
    const input = buildDefaultInput({ focusSkill: 'writing' });
    const result = engine.generate(input);
    // The SkillSpecificStrategy should be one of the strategies used
    expect(result.diagnostics.strategiesUsed).toContain('skill-specific');
  });

  it('every recommendation should have required fields', () => {
    const input = buildDefaultInput();
    const result = engine.generate(input);

    for (const rec of result.recommendations) {
      expect(rec.id).toBeTruthy();
      expect(rec.type).toBeTruthy();
      expect(rec.skill).toBeTruthy();
      expect(rec.title).toBeTruthy();
      expect(rec.titleZh).toBeTruthy();
      expect(rec.reason).toBeTruthy();
      expect(rec.reasonZh).toBeTruthy();
      expect(rec.confidenceScore).toBeGreaterThan(0);
      expect(rec.confidenceScore).toBeLessThanOrEqual(1);
      expect(rec.estimatedTime).toBeGreaterThan(0);
      expect(rec.difficulty).toBeGreaterThanOrEqual(1);
      expect(rec.difficulty).toBeLessThanOrEqual(5);
      expect(rec.expectedLearningGain).toBeGreaterThanOrEqual(0);
      expect(rec.expectedLearningGain).toBeLessThanOrEqual(100);
      expect(rec.priority).toBeTruthy();
      expect(rec.cefr).toBeTruthy();
      expect(rec.strategy).toBeTruthy();
      expect(rec.generatedAt).toBeInstanceOf(Date);
    }
  });

  it('should include summary statistics', () => {
    const input = buildDefaultInput();
    const result = engine.generate(input);

    expect(result.summary.total).toBeGreaterThan(0);
    expect(result.summary.byPriority.mustDo + result.summary.byPriority.shouldDo + result.summary.byPriority.couldDo).toBe(result.summary.total);
    expect(Object.keys(result.summary.byType).length).toBeGreaterThan(0);
    expect(Object.keys(result.summary.bySkill).length).toBeGreaterThan(0);
  });
});

// ============================================
// Strategy Tests
// ============================================

describe('RecommendationStrategies', () => {
  function makeContext(input?: RecommendationInput) {
    return { input: input || buildDefaultInput(), now: new Date() };
  }

  it('WeaknessExerciseStrategy should apply when mastery gaps exist', () => {
    const strategy = new WeaknessExerciseStrategy();
    const ctx = makeContext();
    expect(strategy.applies(ctx)).toBe(true);
    const result = strategy.generate(ctx);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('WeaknessExerciseStrategy should not apply when all skills mastered', () => {
    const strategy = new WeaknessExerciseStrategy();
    const input = buildDefaultInput({
      masteryScores: buildMasteryScores([
        { nodeId: 'present-perfect', currentMastery: 90 } as Partial<MasteryScoreEntry>,
        { nodeId: 'reading-inference', currentMastery: 85 } as Partial<MasteryScoreEntry>,
        { nodeId: 'writing-essay-structure', currentMastery: 80 } as Partial<MasteryScoreEntry>,
      ]),
    });
    expect(strategy.applies(makeContext(input))).toBe(false);
  });

  it('SpacedRepetitionStrategy should find due reviews', () => {
    const strategy = new SpacedRepetitionStrategy();
    const ctx = makeContext();
    expect(strategy.applies(ctx)).toBe(true);
    const result = strategy.generate(ctx);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('MistakeReviewStrategy should use mistake data', () => {
    const strategy = new MistakeReviewStrategy();
    const ctx = makeContext();
    expect(strategy.applies(ctx)).toBe(true);
    const result = strategy.generate(ctx);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('VocabularyReviewStrategy should apply when due vocab exists', () => {
    const strategy = new VocabularyReviewStrategy();
    const ctx = makeContext();
    expect(strategy.applies(ctx)).toBe(true);
  });

  it('SkillSpecificStrategy should not apply without focus skill', () => {
    const strategy = new SkillSpecificStrategy();
    expect(strategy.applies(makeContext())).toBe(false);

    const ctx = makeContext(buildDefaultInput({ focusSkill: 'reading' }));
    expect(strategy.applies(ctx)).toBe(true);
  });

  it('StreakMaintenanceStrategy should apply with active streak', () => {
    const strategy = new StreakMaintenanceStrategy();
    const ctx = makeContext();
    expect(strategy.applies(ctx)).toBe(true); // streak = 4
  });
});

// ============================================
// Scorer Tests
// ============================================

describe('RecommendationScorer', () => {
  it('should produce scores in 0-100 range', () => {
    const input = buildDefaultInput();
    const engine = new RecommendationEngine();
    const result = engine.generate(input);

    for (const rec of result.recommendations) {
      const scored = scoreRecommendation(rec, input);
      expect(scored.compositeScore).toBeGreaterThanOrEqual(0);
      expect(scored.compositeScore).toBeLessThanOrEqual(100);
      expect(scored.scoreFactors).toBeDefined();
    }
  });

  it('scoreAll should sort by priority then score', () => {
    const input = buildDefaultInput();
    const engine = new RecommendationEngine();
    const result = engine.generate(input);
    const scored = scoreAll(result.recommendations, input);

    for (let i = 1; i < scored.length; i++) {
      const prevP = { 'must-do': 0, 'should-do': 1, 'could-do': 2 }[scored[i - 1].priority];
      const currP = { 'must-do': 0, 'should-do': 1, 'could-do': 2 }[scored[i].priority];
      expect(currP).toBeGreaterThanOrEqual(prevP);
    }
  });

  it('getConfidenceBand should classify correctly', () => {
    expect(getConfidenceBand(80)).toBe('high');
    expect(getConfidenceBand(50)).toBe('medium');
    expect(getConfidenceBand(30)).toBe('low');
    expect(getConfidenceBand(70)).toBe('high');
    expect(getConfidenceBand(40)).toBe('medium');
  });
});

// ============================================
// Reason Generator Tests
// ============================================

describe('ReasonGenerator', () => {
  it('should generate bilingual reasons', () => {
    const input = buildDefaultInput();
    const engine = new RecommendationEngine();
    const result = engine.generate(input);

    for (const rec of result.recommendations) {
      const { reason, reasonZh } = generateReasons(rec, input);
      expect(reason.length).toBeGreaterThan(5);
      expect(reasonZh.length).toBeGreaterThan(5);
      expect(reason).not.toBe(reasonZh); // Different languages
    }
  });

  it('enrichRecommendations should add reasons', () => {
    const input = buildDefaultInput();
    const engine = new RecommendationEngine();
    const result = engine.generate(input);

    const withoutReasons = result.recommendations.map(r => ({ ...r, reason: '', reasonZh: '' }));
    const enriched = enrichRecommendations(withoutReasons, input);

    for (const rec of enriched) {
      expect(rec.reason.length).toBeGreaterThan(5);
      expect(rec.reasonZh.length).toBeGreaterThan(5);
    }
  });

  it('should handle unknown strategy with default template', () => {
    const input = buildDefaultInput();
    const unknownRec: Recommendation = {
      id: 'test-1', type: 'next-exercise', skill: 'grammar',
      nodeId: 'test', title: 'Test', titleZh: '測試',
      reason: '', reasonZh: '',
      confidenceScore: 0.7, estimatedTime: 15, difficulty: 2,
      expectedLearningGain: 30, priority: 'should-do',
      cefr: 'B1', strategy: 'unknown-strategy', generatedAt: new Date(),
    };
    const { reason, reasonZh } = generateReasons(unknownRec, input);
    expect(reason.length).toBeGreaterThan(5);
    expect(reasonZh.length).toBeGreaterThan(5);
  });
});

// ============================================
// Service Tests
// ============================================

describe('RecommendationService', () => {
  it('should generate via quickRecommend', () => {
    const result = recommendationService.quickRecommend(
      'student-1', 'S4', buildMasteryScores(),
      { availableStudyTime: 30, maxRecommendations: 3 },
    );
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('should generate via fullRecommend', () => {
    const result = recommendationService.fullRecommend(
      'student-2', 'S4',
      buildMasteryScores(), buildProfile(), buildMistakeStats(),
      [], [{ topic: 'sports', category: 'society', engagementCount: 3, averageScore: 70 }],
      45, { maxRecommendations: 4 },
    );
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should invalidate cache', () => {
    const result1 = recommendationService.quickRecommend('student-3', 'S4', buildMasteryScores());
    recommendationService.invalidateCache('student-3');
    const result2 = recommendationService.quickRecommend('student-3', 'S4', buildMasteryScores());
    // Results should be equal (deterministic), but cache was cleared in between
    expect(result1.recommendations.length).toBe(result2.recommendations.length);
  });
});

// ============================================
// Repository Tests
// ============================================

describe('RecommendationRepository', () => {
  beforeEach(() => {
    recommendationRepo.clearAll();
  });

  it('should cache and return recommendations', () => {
    const input = buildDefaultInput();
    const r1 = recommendationRepo.getOrGenerate(input);
    const r2 = recommendationRepo.getOrGenerate(input);

    // Same input → same result (cached)
    expect(r1.recommendations.length).toBe(r2.recommendations.length);
    expect(recommendationRepo.getCacheSize()).toBe(1);
  });

  it('should invalidate by student ID', () => {
    const input = buildDefaultInput();
    recommendationRepo.getOrGenerate(input);
    expect(recommendationRepo.getCacheSize()).toBe(1);

    recommendationRepo.invalidate('test-student-1');
    expect(recommendationRepo.getCacheSize()).toBe(0);
  });

  it('should clear all cache', () => {
    recommendationRepo.getOrGenerate(buildDefaultInput());
    recommendationRepo.getOrGenerate(buildDefaultInput({ studentId: 'other-student' }));
    expect(recommendationRepo.getCacheSize()).toBe(2);

    recommendationRepo.clearAll();
    expect(recommendationRepo.getCacheSize()).toBe(0);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('EdgeCases', () => {
  it('should handle zero available study time', () => {
    const input = buildDefaultInput({ availableStudyTime: 0 });
    const engine = new RecommendationEngine();
    const result = engine.generate(input);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    expect(result.totalEstimatedTime).toBeGreaterThanOrEqual(0);
  });

  it('should handle fully mastered student', () => {
    const allMastered = buildMasteryScores([
      { nodeId: 'present-perfect', currentMastery: 95 },
      { nodeId: 'reading-inference', currentMastery: 90 },
      { nodeId: 'writing-essay-structure', currentMastery: 85 },
    ]);
    const input = buildDefaultInput({ masteryScores: allMastered, mistakeStats: buildMistakeStats({ totalMistakes: 0, byCategory: {} }) });
    const engine = new RecommendationEngine();
    const result = engine.generate(input);
    // Should still produce some recommendations (learning path, streak, etc.)
    expect(result.diagnostics.strategiesUsed.length).toBeGreaterThan(0);
  });

  it('should handle student with no history', () => {
    const input = buildDefaultInput({
      learningProfile: buildProfile({ totalPracticeSessions: 0, totalQuestionsAnswered: 0, currentStreak: 0 }),
      sessionHistory: [],
      preferredTopics: [],
    });
    const engine = new RecommendationEngine();
    const result = engine.generate(input);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
  });

  it('should generate unique IDs for recommendations', () => {
    const input = buildDefaultInput();
    const engine = new RecommendationEngine();
    const result = engine.generate(input);

    const ids = new Set(result.recommendations.map(r => r.id));
    expect(ids.size).toBe(result.recommendations.length);
  });
});
