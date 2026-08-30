// Sprint 59: Student Digital Twin — Tests
// Tests the public API (builder delegation + type mapping)
import { describe, it, expect, vi } from 'vitest';
import type { StudentState } from '@/modules/student/state/StudentState';
import type { StudentTwin } from '../types';

// Mock StudentStateBuilder
const mockState: StudentState = {
  identity: { id: 's1', email: 's@test.hk', nameZh: '學生', nameEn: 'Student', role: 'student', level: 'S4', classId: null, className: null, gradeLevel: null, academicYear: null },
  memory: null,
  mastery: { overallScore: 65, bySkill: {}, entries: [], weakSkills: [], strongSkills: [], estimatedHkdseLevel: '3', estimatedCefrLevel: 'B1' },
  weakness: null,
  vocabulary: null,
  engagement: { xp: 500, level: 2, streakDays: 3, badges: [], overallAccuracy: 70 },
  practice: { totalSessions: 10, totalQuestions: 100, totalCorrect: 70, recentSessions: 5 },
  persona: { type: 'steady-grinder', typeZh: '穩定耕耘者', description: '', descriptionZh: '', traits: [], traitsZh: [], recommendedApproach: '', recommendedApproachZh: '' },
  knowledge: {
    currentMastery: {}, predictedMastery: { '7d': {}, '30d': {}, '90d': {} },
    strongSkills: [], weakSkills: [], estimatedHkdseLevel: '3', estimatedCefrLevel: 'B1',
    nodesMastered: 5, totalNodes: 10, learningVelocity: 0.5, retentionRate: 0.8,
  },
  motivation: { overallScore: 0.5, intrinsic: 0.5, extrinsic: 0.5, trend: 'stable', engagementLevel: 0.5, consistencyScore: 0.5, burnoutRisk: 0.1, dropoutRisk: 0.2, recentAchievements: [], suggestedMotivators: [], suggestedMotivatorsZh: [] },
  confidence: { overallConfidence: 0.5, perSkill: {}, calibrationAccuracy: 0, overconfidentIn: [], underconfidentIn: [], confidenceTrend: 'stable', suggestedConfidenceBoosters: [], suggestedConfidenceBoostersZh: [] },
  habits: { preferredTime: 'evening', sessionsPerWeek: 2, avgSessionMinutes: 20, completionRate: 0.5, consistencyScore: 0.5, procrastinationIndex: 0.5, focusLevel: 0.5, fatigueEstimation: 0.3, optimalSessionLength: 20, distractionPatterns: [], improvementSuggestions: [], improvementSuggestionsZh: [] },
  predictions: { predictedHkdseLevel: '3', predictedExamScore: 50, examScoreRange: { low: 40, high: 60, confidence: 0.7 }, predictedCefrLevel: 'B1', skillPredictions: [], trajectory: 'steady', recommendedWeeklyMinutes: 120 },
  risks: { overallRisk: 'low', dropoutRisk: 0.1, burnoutRisk: 0.1, plateauRisk: 0.3, regressionRisk: 0.2, examReadiness: 0.5, riskFactors: [], riskFactorsZh: [], mitigationStrategies: [], mitigationStrategiesZh: [], requiresIntervention: false, interventionSuggestions: [], interventionSuggestionsZh: [] },
  retention: { overallRate: 0.5, perSkill: {}, averageRetentionDays: 7, atRiskSkills: [], strongSkills: [], trend: 'stable', recommendedReviewCadence: 7 },
  forgetCurve: { curves: {}, composite: [], knowledgeHalfLifeDays: 7, computedAt: '' },
  velocity: { weeklyMasteryRate: 0.5, improvementPerSession: 0.01, estimatedWeeksToTarget: 26, weeklyHistory: [], peerPercentile: null, trend: 'steady' },
  recovery: { avgRecoveryDays: 7, recoveryRate: 0.5, reviewCompliance: 0.5, daysSinceLastReview: 1, overdueReviewCount: 2, reviewStreak: 3, onTrack: true },
  generatedAt: new Date().toISOString(),
};

// Mock the builder before importing the service
vi.mock('@/modules/student/state/StudentStateBuilder', () => ({
  studentStateBuilder: { build: () => Promise.resolve(mockState) },
}));

// Dynamic import so vi.mock takes effect
const { StudentTwinService } = await import('../services/student-twin-service');
const service = new StudentTwinService();

describe('StudentTwinService — public API (Sprint 59)', () => {
  it('buildTwin() should return a valid StudentTwin', async () => {
    const twin = await service.buildTwin('s1');
    expect(twin.studentId).toBe('s1');
    expect(twin.generatedAt).toBeTruthy();
    expect(twin.persona.type).toBe('steady-grinder');
    expect(twin.knowledge.estimatedHkdseLevel).toBe('3');
    expect(twin.predictions.predictedExamScore).toBe(50);
    expect(twin.risks.overallRisk).toBe('low');
  });

  it('buildTwin() maps dashboard.summary correctly', async () => {
    const twin = await service.buildTwin('s1');
    expect(twin.dashboard.summary.studentId).toBe('s1');
    expect(twin.dashboard.summary.estimatedLevel).toBe('3');
    expect(twin.dashboard.summary.overallProgress).toBe(0.65);
  });

  it('getKnowledgeState() returns knowledge from state', async () => {
    const knowledge = await service.getKnowledgeState('s1');
    expect(knowledge.estimatedHkdseLevel).toBe('3');
    expect(knowledge.retentionRate).toBe(0.8);
  });

  it('getPredictions() returns predictions from state', async () => {
    const predictions = await service.getPredictions('s1');
    expect(predictions.predictedExamScore).toBe(50);
    expect(predictions.trajectory).toBe('steady');
  });

  it('getRiskAssessment() returns risks from state', async () => {
    const risks = await service.getRiskAssessment('s1');
    expect(risks.overallRisk).toBe('low');
    expect(risks.requiresIntervention).toBe(false);
  });

  it('getMasteryProfile() returns mastery from state', async () => {
    const mastery = await service.getMasteryProfile('s1');
    expect(mastery.overallScore).toBe(65);
    expect(mastery.estimatedHkdseLevel).toBe('3');
  });

  it('getWeaknessProfile() returns weakness from state', async () => {
    const weakness = await service.getWeaknessProfile('s1');
    expect(weakness).toBeNull();
  });

  it('getVocabProfile() returns vocab from state', async () => {
    const vocab = await service.getVocabProfile('s1');
    expect(vocab).toBeNull();
  });
});
