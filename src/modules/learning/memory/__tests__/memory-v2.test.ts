// Sprint 36: Long-term Learning Memory v2 — Tests
import { describe, it, expect } from 'vitest';
import { MemoryEngine } from '../services/memory-engine';
import { MemoryProfileGenerator } from '../services/memory-profile';
import { MemoryInfluenceEngine } from '../services/memory-influence';
import { createEmptyMemory, MemoryService } from '../services/memory-service';
import type { IMemoryRepository } from '../repositories/memory-repository-interface';
import type { LearningMemory } from '../types';

class TestRepo implements IMemoryRepository {
  private s = new Map<string, LearningMemory>();
  async get(id: string) { return this.s.get(id) ?? null; }
  async save(id: string, m: LearningMemory) { m.updatedAt = new Date(); m.version++; this.s.set(id, m); }
  async has(id: string) { return this.s.has(id); }
  async delete(id: string) { return this.s.delete(id); }
  async getAllStudentIds() { return [...this.s.keys()]; }
  async count() { return this.s.size; }
}

const engine = new MemoryEngine(new TestRepo());
const profileGen = new MemoryProfileGenerator();
const influenceEngine = new MemoryInfluenceEngine();

// Helper to create v2 memory
function makeV2Memory() {
  const base = createEmptyMemory('s1');
  return {
    ...base,
    confidence: { overallConfidence: 0.6, confidenceBySkill: { grammar: 0.7 }, calibrationAccuracy: 0.3, overconfidentTopics: [], underconfidentTopics: [], confidenceTrend: 'stable' as const },
    motivation: { motivationLevel: 0.6, intrinsicMotivation: 0.7, extrinsicMotivation: 0.5, motivationTrend: 'stable' as const, burnoutRisk: 0.2, engagementScore: 0.6, recentAchievements: [], demotivationTriggers: [] },
    learningHabits: { preferredStudyTime: 'afternoon' as const, averageSessionLength: 20, sessionsPerWeek: 3, weekendWarrior: false, distractionPatterns: [], focusLevel: 0.7, noteTakingStyle: 'moderate' as const, reviewConsistency: 0.6, procrastinationIndex: 0.4 },
    lastDecayApplied: new Date().toISOString(),
    memoryFreshness: 0.9,
  };
}

describe('MemoryEngine', () => {
  it('should get or create memory', async () => {
    const memory = await engine.get('test-s1');
    expect(memory.studentId).toBe('test-s1');
    expect(memory.confidence).toBeDefined();
    expect(memory.motivation).toBeDefined();
    expect(memory.learningHabits).toBeDefined();
    expect(memory.memoryFreshness).toBeGreaterThan(0);
  });

  it('should update memory with grammar data', async () => {
    await engine.update('test-s1', {
      grammarTopics: [{ topic: 'past-tense', topicZh: '過去式', correct: false }],
    });
    const memory = await engine.get('test-s1');
    expect(memory.grammar.strugglingTopics.length).toBeGreaterThan(0);
    expect(memory.grammar.strugglingTopics[0].topic).toBe('past-tense');
  });

  it('should update memory with vocabulary data', async () => {
    await engine.update('test-s1', {
      newWords: [{ word: 'ubiquitous' }, { word: 'ephemeral' }],
    });
    const memory = await engine.get('test-s1');
    expect(memory.vocabulary.knownWords).toBeGreaterThan(0);
    expect(memory.vocabulary.recentlyLearned.length).toBeGreaterThan(0);
  });

  it('should update memory with session data', async () => {
    await engine.update('test-s1', {
      sessionData: { duration: 25, questionsAnswered: 10, correct: 7, timeOfDay: '14:00' },
    });
    const memory = await engine.get('test-s1');
    expect(memory.learningSpeed.questionsPerDay).toBeGreaterThan(0);
    expect(memory.learningSpeed.averageSessionDuration).toBeGreaterThan(0);
  });

  it('should update memory with mistakes', async () => {
    await engine.update('test-s1', {
      mistakes: [{ question: 'Q1', studentAnswer: 'go', correctAnswer: 'went', category: 'tense' }],
    });
    const memory = await engine.get('test-s1');
    expect(memory.recentErrors.last10Errors.length).toBeGreaterThan(0);
    expect(memory.recentErrors.mostRecentErrorCategory).toBe('tense');
  });

  it('should update confidence from self-assessment', async () => {
    await engine.update('test-s1', {
      selfAssessment: { confidence: 0.8, actualScore: 0.9 },
    });
    const memory = await engine.get('test-s1');
    expect(memory.confidence.overallConfidence).toBeGreaterThan(0);
  });

  it('should apply decay', async () => {
    const result = await engine.applyDecay('test-s1');
    expect(result.previousFreshness).toBeDefined();
    expect(result.newFreshness).toBeDefined();
    expect(result.appliedAt).toBeTruthy();
  });

  it('should refresh memory', async () => {
    const result = await engine.refresh('test-s1', {
      recentAccuracy: 0.8,
      masteredTopics: ['past-tense'],
      activeSkills: ['grammar'],
    });
    expect(result.itemsRefreshed).toBeGreaterThanOrEqual(0);
    expect(result.refreshedAt).toBeTruthy();
  });

  it('should generate memory profile', async () => {
    const profile = await engine.getProfile('test-s1');
    expect(profile.studentId).toBe('test-s1');
    expect(profile.overallMetrics).toBeDefined();
    expect(profile.overallMetrics.memoryFreshness).toBeGreaterThanOrEqual(0);
    expect(profile.topStrengths).toBeDefined();
    expect(profile.nextMilestones.length).toBeGreaterThan(0);
    expect(profile.nextMilestonesZh.length).toBeGreaterThan(0);
  });

  it('should generate memory influence', async () => {
    const influence = await engine.getInfluence('test-s1');
    expect(influence.promptModifiers.length).toBeGreaterThan(0);
    expect(influence.exercisePreferences).toBeDefined();
    expect(influence.feedbackPreferences).toBeDefined();
    expect(influence.recommendationModifiers).toBeDefined();
    expect(influence.exercisePreferences.difficultyBias).toBeDefined();
  });

  it('should generate learning context', async () => {
    const ctx = await engine.getContext('test-s1', { recentAccuracy: 0.75, recentStreak: 3, recentQuestions: 50 });
    expect(ctx.studentId).toBe('test-s1');
    expect(ctx.summary).toBeTruthy();
    expect(ctx.keyMetrics).toBeDefined();
  });
});

describe('MemoryProfileGenerator', () => {
  it('should generate profile from memory', () => {
    const memory = makeV2Memory();
    memory.grammar.masteredTopics = ['tenses', 'articles'];
    memory.grammar.strugglingTopics = [{ topic: 'prepositions', topicZh: '介詞', errorRate: 0.6, lastPracticed: new Date().toISOString() }];
    memory.weaknesses.persistentWeaknesses = [{ skill: 'grammar', topic: 'prepositions', topicZh: '介詞', duration: 45, severity: 'major' }];

    const profile = profileGen.generate(memory);
    expect(profile.overallMetrics.masteryPercentage).toBeGreaterThan(0);
    expect(profile.criticalWeaknesses.length).toBeGreaterThan(0);
    expect(profile.skillProfiles).toBeDefined();
    expect(profile.nextMilestonesZh.length).toBe(3);
  });
});

describe('MemoryInfluenceEngine', () => {
  it('should compute influence from memory', () => {
    const memory = makeV2Memory();
    memory.grammar.strugglingTopics = [{ topic: 'tenses', topicZh: '時態', errorRate: 0.5, lastPracticed: new Date().toISOString() }];
    memory.writingStyle.commonChinglishPatterns = [{ pattern: 'although...but', patternZh: '雖然...但是', occurrences: 5 }];
    memory.reviewHistory.overdueReviews = 6;

    const influence = influenceEngine.compute(memory);
    expect(influence.promptModifiers.length).toBeGreaterThan(0);
    expect(influence.promptModifiersZh.length).toBeGreaterThan(0);
    expect(influence.exercisePreferences.topicsToFocus.length).toBeGreaterThan(0);
    expect(influence.feedbackPreferences.detailLevel).toBeDefined();
    expect(influence.recommendationModifiers.suggestedStrategies.length).toBeGreaterThan(0);
    expect(influence.recommendationModifiers.suggestedStrategies).toContain('spaced-repetition');
  });

  it('should detect burnout risk and adjust tone', () => {
    const memory = makeV2Memory();
    memory.motivation.burnoutRisk = 0.7;
    memory.confidence.overallConfidence = 0.3;

    const influence = influenceEngine.compute(memory);
    expect(influence.promptModifiers.some(m => m.includes('encouraging'))).toBe(true);
    expect(influence.feedbackPreferences.tonePreference).toBe('encouraging');
  });

  it('should recommend challenge content for motivated students', () => {
    const memory = makeV2Memory();
    memory.motivation.motivationLevel = 0.8;

    const influence = influenceEngine.compute(memory);
    expect(influence.recommendationModifiers.includeChallengeContent).toBe(true);
  });

  it('should prioritize interests when student has diverse topics', () => {
    const memory = makeV2Memory();
    memory.preferredTopics.topTopics = [
      { topic: 'environment', topicZh: '環境', engagementScore: 5, accuracy: 0.8 },
      { topic: 'technology', topicZh: '科技', engagementScore: 4, accuracy: 0.7 },
      { topic: 'sports', topicZh: '運動', engagementScore: 3, accuracy: 0.9 },
      { topic: 'food', topicZh: '食物', engagementScore: 2, accuracy: 0.6 },
    ];

    const influence = influenceEngine.compute(memory);
    expect(influence.recommendationModifiers.prioritizeInterests).toBe(true);
  });
});

describe('Memory v2 — Backward Compatibility', () => {
  it('should handle v1 memory objects', () => {
    const v1 = createEmptyMemory('v1-student');
    // Engine should auto-upgrade
    const upgraded = (engine as any).ensureV2(v1);
    expect(upgraded.confidence).toBeDefined();
    expect(upgraded.motivation).toBeDefined();
    expect(upgraded.learningHabits).toBeDefined();
  });
});