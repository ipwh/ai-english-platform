// Sprint 37: Student Digital Twin — Tests
import { describe, it, expect } from 'vitest';
import { StudentTwinService } from '../services/student-twin-service';

const service = new StudentTwinService();

// Access private methods for unit testing
const s = service as any;

describe('LearningPersona', () => {
  it('should classify balanced achiever', () => {
    const memory = {
      learningSpeed: { consistencyScore: 0.8 },
      motivation: { motivationLevel: 0.8, burnoutRisk: 0.1 },
    };
    const entries = Array(10).fill(null).map((_, i) => ({ isMastered: true, estimatedMastery: 0.9, skillDimension: 'grammar' }));
    const persona = s.buildPersona(memory, entries);
    expect(persona.type).toBe('balanced-achiever');
    expect(persona.typeZh).toBeTruthy();
    expect(persona.traits.length).toBeGreaterThan(0);
    expect(persona.traitsZh.length).toBeGreaterThan(0);
  });

  it('should classify anxious perfectionist with high burnout', () => {
    const memory = {
      learningSpeed: { consistencyScore: 0.8 },
      motivation: { burnoutRisk: 0.7 },
    };
    const entries = [{ isMastered: true, estimatedMastery: 0.9 }];
    const persona = s.buildPersona(memory, entries);
    expect(persona.type).toBe('anxious-perfectionist');
  });

  it('should classify struggling-but-persistent', () => {
    const memory = {
      learningSpeed: { consistencyScore: 0.7 },
      motivation: { motivationLevel: 0.3, burnoutRisk: 0.2 },
    };
    const entries = [{ isMastered: false, estimatedMastery: 0.3 }];
    const persona = s.buildPersona(memory, entries);
    expect(persona.type).toBe('struggling-but-persistent');
  });

  it('should include recommended approach', () => {
    const memory = { learningSpeed: { consistencyScore: 0.5 }, motivation: { motivationLevel: 0.5, burnoutRisk: 0.1 } };
    const entries = [{ isMastered: true, estimatedMastery: 0.7 }];
    const persona = s.buildPersona(memory, entries);
    expect(persona.recommendedApproach).toBeTruthy();
    expect(persona.recommendedApproachZh).toBeTruthy();
  });
});

describe('KnowledgeState', () => {
  it('should build knowledge state from entries', () => {
    const mastery = { grammar: 0.8, vocabulary: 0.6, reading: 0.7 };
    const entries = [
      { skillDimension: 'grammar', estimatedMastery: 0.8, isMastered: true, evidenceCount: 5, retentionProbability: 0.9 },
      { skillDimension: 'vocabulary', estimatedMastery: 0.6, isMastered: false, evidenceCount: 3, retentionProbability: 0.7 },
    ];
    const state = s.buildKnowledge(mastery, entries);
    expect(state.currentMastery).toBeDefined();
    expect(state.strongSkills.length).toBeGreaterThan(0);
    expect(state.weakSkills.length).toBeGreaterThan(0);
    expect(state.estimatedHkdseLevel).toBeTruthy();
    expect(state.estimatedCefrLevel).toBeTruthy();
    expect(state.learningVelocity).toBeGreaterThanOrEqual(0);
    expect(state.predictedMastery['7d']).toBeDefined();
    expect(state.predictedMastery['30d']).toBeDefined();
    expect(state.predictedMastery['90d']).toBeDefined();
  });

  it('should estimate HKDSE level from mastery', () => {
    expect(s.estimateHkdse({ grammar: 0.95 })).toBe('5**');
    expect(s.estimateHkdse({ grammar: 0.5 })).toBe('3');
    expect(s.estimateHkdse({ grammar: 0.2 })).toBe('1');
  });
});

describe('MotivationState', () => {
  it('should compute motivation from memory', () => {
    const memory = {
      motivation: { motivationLevel: 0.7, intrinsicMotivation: 0.8, extrinsicMotivation: 0.5, motivationTrend: 'improving', engagementScore: 0.7, burnoutRisk: 0.2, recentAchievements: [] },
      learningSpeed: { consistencyScore: 0.6, sessionsPerWeek: 3 },
    };
    const state = s.buildMotivation(memory, []);
    expect(state.overallScore).toBe(0.7);
    expect(state.intrinsic).toBe(0.8);
    expect(state.dropoutRisk).toBeLessThan(0.5);
  });

  it('should flag high dropout risk with low activity', () => {
    const memory = {
      motivation: { motivationLevel: 0.2, intrinsicMotivation: 0.3, extrinsicMotivation: 0.2, motivationTrend: 'declining', engagementScore: 0.2, burnoutRisk: 0.6, recentAchievements: [] },
      learningSpeed: { consistencyScore: 0.1, sessionsPerWeek: 0 },
    };
    const state = s.buildMotivation(memory, []);
    expect(state.dropoutRisk).toBeGreaterThan(0.5);
    expect(state.suggestedMotivators.length).toBeGreaterThan(0);
  });
});

describe('ConfidenceState', () => {
  it('should detect overconfidence', () => {
    const memory = { confidence: { overallConfidence: 0.9, confidenceBySkill: { grammar: 0.9 }, calibrationAccuracy: 0.3 } };
    const mastery = { grammar: 0.5 };
    const state = s.buildConfidence(memory, mastery);
    expect(state.overconfidentIn).toContain('grammar');
  });

  it('should detect underconfidence', () => {
    const memory = { confidence: { confidenceBySkill: { grammar: 0.3 }, calibrationAccuracy: 0.3 } };
    const mastery = { grammar: 0.8 };
    const state = s.buildConfidence(memory, mastery);
    expect(state.underconfidentIn).toContain('grammar');
    expect(state.suggestedConfidenceBoosters.length).toBeGreaterThan(0);
  });
});

describe('LearningHabit', () => {
  it('should compute habits from memory', () => {
    const memory = {
      learningHabits: { preferredStudyTime: 'evening', procrastinationIndex: 0.7, focusLevel: 0.4 },
      learningSpeed: { consistencyScore: 0.3, sessionsPerWeek: 1, averageSessionDuration: 20, completionRate: 0.5 },
    };
    const habits = s.buildHabits(memory, []);
    expect(habits.preferredTime).toBe('evening');
    expect(habits.procrastinationIndex).toBe(0.7);
    expect(habits.fatigueEstimation).toBeGreaterThanOrEqual(0);
    expect(habits.improvementSuggestions.length).toBeGreaterThan(0);
    expect(habits.improvementSuggestionsZh.length).toBeGreaterThan(0);
  });
});

describe('TwinPredictions', () => {
  it('should predict exam score', () => {
    const mastery = { grammar: 0.7 };
    const entries = [{ estimatedMastery: 0.7, skillDimension: 'grammar', evidenceCount: 5 }];
    const knowledge = s.buildKnowledge(mastery, entries);
    const predictions = s.buildPredictions(mastery, entries, knowledge);
    expect(predictions.predictedExamScore).toBeGreaterThan(0);
    expect(predictions.predictedExamScore).toBeLessThanOrEqual(100);
    expect(predictions.examScoreRange.low).toBeLessThan(predictions.examScoreRange.high);
    expect(predictions.skillPredictions.length).toBeGreaterThan(0);
  });
});

describe('RiskAssessment', () => {
  it('should assess low risk for engaged student', () => {
    const motivation = { dropoutRisk: 0.1, burnoutRisk: 0.1 };
    const knowledge = { learningVelocity: 5, retentionRate: 0.9, currentMastery: { grammar: 0.8 } };
    const risks = s.buildRisks(motivation, knowledge, []);
    expect(risks.overallRisk).toBe('low');
    expect(risks.requiresIntervention).toBe(false);
  });

  it('should flag critical risk for disengaged student', () => {
    const motivation = { dropoutRisk: 0.6, burnoutRisk: 0.7 };
    const knowledge = { learningVelocity: 0.2, retentionRate: 0.3, currentMastery: { grammar: 0.2 } };
    const risks = s.buildRisks(motivation, knowledge, []);
    expect(risks.overallRisk).toBe('critical');
    expect(risks.requiresIntervention).toBe(true);
    expect(risks.mitigationStrategies.length).toBeGreaterThan(0);
  });
});

describe('DashboardData', () => {
  it('should build dashboard-ready JSON', () => {
    const persona = s.buildPersona({ learningSpeed: { consistencyScore: 0.5 }, motivation: { motivationLevel: 0.5, burnoutRisk: 0.1 } }, [{ isMastered: true, estimatedMastery: 0.7 }]);
    const knowledge = s.buildKnowledge({ grammar: 0.7 }, [{ skillDimension: 'grammar', estimatedMastery: 0.7, isMastered: true, evidenceCount: 5, retentionProbability: 0.8 }]);
    const motivation = s.buildMotivation({ motivation: { motivationLevel: 0.5, intrinsicMotivation: 0.5, extrinsicMotivation: 0.5, motivationTrend: 'stable', engagementScore: 0.5, burnoutRisk: 0.1, recentAchievements: [] }, learningSpeed: { consistencyScore: 0.5, sessionsPerWeek: 2 } }, []);
    const confidence = s.buildConfidence({ confidence: { confidenceBySkill: {} } }, { grammar: 0.7 });
    const habits = s.buildHabits({ learningHabits: { preferredStudyTime: 'afternoon', procrastinationIndex: 0.3, focusLevel: 0.6 }, learningSpeed: { consistencyScore: 0.5, sessionsPerWeek: 2, averageSessionDuration: 20, completionRate: 0.7 } }, []);
    const predictions = s.buildPredictions({ grammar: 0.7 }, [{ estimatedMastery: 0.7, skillDimension: 'grammar', evidenceCount: 5 }], knowledge);
    const risks = s.buildRisks(motivation, knowledge, []);

    const dashboard = s.buildDashboard(persona, knowledge, motivation, confidence, habits, predictions, risks);
    expect(dashboard.kpiCards.length).toBe(5);
    expect(dashboard.skillRadar.length).toBeGreaterThan(0);
    expect(dashboard.riskIndicators.length).toBeGreaterThan(0);
    expect(dashboard.nextMilestones.length).toBe(3);
  });
});