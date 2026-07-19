// Sprint 40: AI Learning Analytics Pro — Tests
import { describe, it, expect } from 'vitest';
import { LearningAnalyticsAI } from '../services/analytics-pro';

const ai = new LearningAnalyticsAI();

const sampleInput = {
  studentId: 's1', gradeLevel: 'S4',
  startDate: '2026-07-13', endDate: '2026-07-19',
  sessions: [
    { date: '2026-07-14', durationMinutes: 25, questionsAnswered: 10, correctCount: 7, skill: 'grammar' },
    { date: '2026-07-15', durationMinutes: 30, questionsAnswered: 12, correctCount: 9, skill: 'vocabulary' },
    { date: '2026-07-16', durationMinutes: 20, questionsAnswered: 8, correctCount: 6, skill: 'reading' },
    { date: '2026-07-17', durationMinutes: 35, questionsAnswered: 15, correctCount: 11, skill: 'grammar' },
    { date: '2026-07-18', durationMinutes: 15, questionsAnswered: 5, correctCount: 4, skill: 'writing' },
  ],
  mistakes: [
    { date: '2026-07-14', type: 'tense', skill: 'grammar' },
    { date: '2026-07-17', type: 'preposition', skill: 'grammar' },
  ],
  vocabulary: [
    { date: '2026-07-15', word: 'ubiquitous', mastered: false },
    { date: '2026-07-15', word: 'ephemeral', mastered: false },
    { date: '2026-07-16', word: 'sustainable', mastered: true },
  ],
  writing: [
    { date: '2026-07-18', textType: 'essay', score: 75, wordCount: 200 },
  ],
  reviews: [
    { date: '2026-07-14', itemId: 'grammar-tenses', quality: 4 },
    { date: '2026-07-17', itemId: 'grammar-tenses', quality: 5 },
  ],
};

describe('LearningAnalyticsAI — Weekly Report', () => {
  it('should generate weekly report', () => {
    const report = ai.generateWeeklyReport(sampleInput);
    expect(report.studentId).toBe('s1');
    expect(report.summary.sessionsCompleted).toBe(5);
    expect(report.summary.accuracy).toBeGreaterThan(0);
    expect(report.summary.newWordsLearned).toBe(2);
    expect(report.summary.writingTasksCompleted).toBe(1);
    expect(report.dailyBreakdown.length).toBeGreaterThan(0);
    expect(report.topSkills.length).toBeGreaterThan(0);
    expect(report.weakestSkills.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendationsZh.length).toBe(report.recommendations.length);
  });
});

describe('LearningAnalyticsAI — Monthly Report', () => {
  it('should generate monthly report', () => {
    const report = ai.generateMonthlyReport(sampleInput);
    expect(report.overview.totalStudyHours).toBeGreaterThan(0);
    expect(report.weeklyBreakdown.length).toBeGreaterThan(0);
    expect(report.trends.grammar).toBeDefined();
    expect(report.trends.vocabulary).toBeDefined();
    expect(report.trends.writing).toBeDefined();
    expect(report.learningVelocity.current).toBeGreaterThan(0);
    expect(report.predictions.estimatedLevel).toBeTruthy();
    expect(report.achievements.length).toBeGreaterThan(0);
    expect(report.achievementsZh.length).toBe(report.achievements.length);
  });

  it('should show trend direction', () => {
    const report = ai.generateMonthlyReport(sampleInput);
    expect(['improving', 'stable', 'declining']).toContain(report.trends.grammar.trend);
    expect(report.trends.grammar.change).toBeDefined();
    expect(report.trends.grammar.chart.length).toBeGreaterThan(0);
  });
});

describe('LearningAnalyticsAI — Mastery Trend', () => {
  it('should generate mastery trend', () => {
    const report = ai.generateMasteryTrend(sampleInput);
    expect(report.overallMastery).toBeGreaterThan(0);
    expect(report.masteryBySkill.length).toBe(5);
    expect(report.masteryHistory.length).toBeGreaterThan(0);
    expect(report.projectedMastery.length).toBe(30);
    expect(report.projectedMastery[0].confidenceLow).toBeLessThan(report.projectedMastery[0].confidenceHigh);
  });

  it('should include confidence bands in projections', () => {
    const report = ai.generateMasteryTrend(sampleInput);
    const last = report.projectedMastery[report.projectedMastery.length - 1];
    expect(last.confidenceLow).toBeLessThan(last.projected);
    expect(last.confidenceHigh).toBeGreaterThan(last.projected);
  });
});

describe('LearningAnalyticsAI — Retention Prediction', () => {
  it('should generate retention prediction', () => {
    const report = ai.generateRetentionPrediction(sampleInput);
    expect(report.overallRetention).toBeGreaterThan(0);
    expect(report.retentionBySkill.length).toBe(5);
    expect(report.retentionBySkill[0].halfLifeDays).toBeGreaterThan(0);
    expect(report.optimalReviewSchedule.length).toBeGreaterThanOrEqual(0);
  });
});

describe('LearningAnalyticsAI — Dashboard', () => {
  it('should generate dashboard JSON', () => {
    const dashboard = ai.generateDashboard(sampleInput);
    expect(dashboard.kpiCards.length).toBe(5);
    expect(dashboard.masteryChart.length).toBe(5);
    expect(dashboard.velocityChart.length).toBe(4);
    expect(dashboard.accuracyTrend.length).toBe(7);
    expect(dashboard.studyTimeDistribution.length).toBe(7);
    expect(dashboard.skillRadar.length).toBe(5);

    // Verify KPI card structure
    const accuracy = dashboard.kpiCards.find(c => c.key === 'accuracy');
    expect(accuracy).toBeDefined();
    expect(accuracy!.labelZh).toBeTruthy();
    expect(accuracy!.trend).toBeDefined();
  });
});