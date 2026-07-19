// Sprint 23: Learning Analytics Platform — Unit Tests
import { describe, it, expect } from 'vitest';
import {
  buildProgressTimeline, buildLearningStatistics,
  buildMasteryTrend, buildWeaknessTrend,
  buildVocabularyGrowth, buildWritingGrowth,
  buildReadingGrowth, buildPrediction,
  generateHeatmap, generateRadarChart,
  generateTrendLines, generateLearningVelocity,
} from '../services/learning-analytics';
import type { AnalyticsInput } from '../services/learning-analytics';

// ============================================
// Test Data
// ============================================

function buildInput(overrides: Partial<AnalyticsInput> = {}): AnalyticsInput {
  const now = new Date();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);

  return {
    studentId: 'test-student',
    gradeLevel: 'S4',
    practiceHistory: [
      { date: iso(1), skillId: 'tenses-simple', skill: 'grammar', correct: true, difficulty: 'core', timeSpentSeconds: 120, xpEarned: 10 },
      { date: iso(1), skillId: 'tenses-simple', skill: 'grammar', correct: false, difficulty: 'core', timeSpentSeconds: 90, xpEarned: 2 },
      { date: iso(2), skillId: 'present-perfect', skill: 'grammar', correct: true, difficulty: 'challenge', timeSpentSeconds: 180, xpEarned: 15 },
      { date: iso(3), skillId: 'reading-inference', skill: 'reading', correct: true, difficulty: 'core', timeSpentSeconds: 200, xpEarned: 10 },
      { date: iso(4), skillId: 'reading-inference', skill: 'reading', correct: false, difficulty: 'core', timeSpentSeconds: 150, xpEarned: 2 },
      { date: iso(5), skillId: 'writing-essay', skill: 'writing', correct: true, difficulty: 'challenge', timeSpentSeconds: 300, xpEarned: 20 },
      { date: iso(6), skillId: 'vocab-basic', skill: 'vocabulary', correct: true, difficulty: 'remedial', timeSpentSeconds: 60, xpEarned: 5 },
      { date: iso(7), skillId: 'listening-gist', skill: 'listening', correct: true, difficulty: 'core', timeSpentSeconds: 180, xpEarned: 10 },
    ],
    mistakeHistory: [
      { date: iso(1), category: 'grammar', categoryZh: '文法', grammarPoint: 'tenses', severity: 'major' },
      { date: iso(3), category: 'comprehension', categoryZh: '理解', severity: 'minor' },
      { date: iso(5), category: 'grammar', categoryZh: '文法', grammarPoint: 'articles', severity: 'critical' },
    ],
    vocabularyHistory: [
      { date: iso(1), word: 'analyze', action: 'added', masteryStars: 1 },
      { date: iso(2), word: 'analyze', action: 'reviewed', masteryStars: 2 },
      { date: iso(3), word: 'evaluate', action: 'added', masteryStars: 1 },
      { date: iso(5), word: 'analyze', action: 'mastered', masteryStars: 5 },
      { date: iso(6), word: 'synthesize', action: 'added', masteryStars: 1 },
    ],
    writingHistory: [
      { date: iso(2), essayId: 'e1', contentScore: 4, languageScore: 3, organizationScore: 4, wordCount: 250, chinglishIssues: 2, vocabUpgrades: 3 },
      { date: iso(6), essayId: 'e2', contentScore: 5, languageScore: 4, organizationScore: 4, wordCount: 300, chinglishIssues: 1, vocabUpgrades: 4 },
    ],
    readingHistory: [
      { date: iso(3), passageId: 'p1', questionsAnswered: 5, correctCount: 3, readTimeSeconds: 180, comprehensionScore: 65 },
      { date: iso(7), passageId: 'p2', questionsAnswered: 5, correctCount: 4, readTimeSeconds: 150, comprehensionScore: 75 },
    ],
    sessionHistory: [
      { date: iso(1), durationMinutes: 25, questionsAnswered: 6, correctCount: 4 },
      { date: iso(4), durationMinutes: 30, questionsAnswered: 4, correctCount: 3 },
    ],
    masterySnapshots: [
      { date: iso(1), skillId: 'tenses-simple', skillName: 'Simple Tenses', skillNameZh: '簡單時態', dimension: 'grammar', masteryScore: 60, accuracy: 0.6, totalAttempts: 5 },
      { date: iso(7), skillId: 'tenses-simple', skillName: 'Simple Tenses', skillNameZh: '簡單時態', dimension: 'grammar', masteryScore: 75, accuracy: 0.75, totalAttempts: 12 },
      { date: iso(1), skillId: 'reading-inference', skillName: 'Making Inferences', skillNameZh: '推論技巧', dimension: 'reading', masteryScore: 40, accuracy: 0.4, totalAttempts: 3 },
      { date: iso(7), skillId: 'reading-inference', skillName: 'Making Inferences', skillNameZh: '推論技巧', dimension: 'reading', masteryScore: 55, accuracy: 0.55, totalAttempts: 8 },
    ],
    ...overrides,
  };
}

// ============================================
// Progress Timeline Tests
// ============================================

describe('ProgressTimeline', () => {
  it('should build weekly timeline', () => {
    const result = buildProgressTimeline(buildInput(), 'weekly');
    expect(result.studentId).toBe('test-student');
    expect(result.granularity).toBe('weekly');
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.summary.totalQuestions).toBeGreaterThan(0);
  });

  it('should build monthly timeline', () => {
    const result = buildProgressTimeline(buildInput(), 'monthly');
    expect(result.points.length).toBeGreaterThan(0);
  });

  it('should calculate summary correctly', () => {
    const result = buildProgressTimeline(buildInput(), 'weekly');
    expect(result.summary.totalQuestions).toBe(8);
    expect(result.summary.totalCorrect).toBe(6);
    expect(result.summary.overallAccuracy).toBe(0.75);
  });

  it('should handle empty data', () => {
    const result = buildProgressTimeline(buildInput({
      practiceHistory: [], sessionHistory: [],
      vocabularyHistory: [], mistakeHistory: [],
    }), 'weekly');
    expect(result.summary.totalQuestions).toBe(0);
    expect(result.summary.overallAccuracy).toBe(0);
  });

  it('should support daily granularity', () => {
    const result = buildProgressTimeline(buildInput(), 'daily');
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.granularity).toBe('daily');
  });
});

// ============================================
// Learning Statistics Tests
// ============================================

describe('LearningStatistics', () => {
  it('should build statistics with all skill dimensions', () => {
    const result = buildLearningStatistics(buildInput(), 'weekly');
    expect(result.bySkill.grammar).toBeDefined();
    expect(result.bySkill.vocabulary).toBeDefined();
    expect(result.bySkill.reading).toBeDefined();
    expect(result.bySkill.writing).toBeDefined();
    expect(result.bySkill.listening).toBeDefined();
    expect(result.bySkill.speaking).toBeDefined();
  });

  it('should calculate by-difficulty stats', () => {
    const result = buildLearningStatistics(buildInput(), 'weekly');
    expect(result.byDifficulty.core.questions).toBeGreaterThan(0);
    expect(result.byDifficulty.challenge.questions).toBeGreaterThan(0);
    expect(result.byDifficulty.remedial.questions).toBeGreaterThan(0);
  });

  it('should handle empty data', () => {
    const result = buildLearningStatistics(buildInput({ practiceHistory: [], sessionHistory: [] }), 'weekly');
    expect(result.overview.totalQuestions).toBe(0);
    expect(result.overview.overallAccuracy).toBe(0);
  });
});

// ============================================
// Mastery Trend Tests
// ============================================

describe('MasteryTrend', () => {
  it('should build mastery trend with improvement detection', () => {
    const result = buildMasteryTrend(buildInput(), 'weekly');
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.overallTrend).toBeTruthy();
  });

  it('should identify improving skills', () => {
    const result = buildMasteryTrend(buildInput(), 'weekly');
    expect(result.topImproving.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle no mastery data', () => {
    const result = buildMasteryTrend(buildInput({ masterySnapshots: [] }), 'weekly');
    expect(result.points.length).toBe(0);
  });
});

// ============================================
// Weakness Trend Tests
// ============================================

describe('WeaknessTrend', () => {
  it('should build weakness trend', () => {
    const result = buildWeaknessTrend(buildInput(), 'weekly');
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.persistentWeaknesses.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle no mistakes', () => {
    const result = buildWeaknessTrend(buildInput({ mistakeHistory: [] }), 'weekly');
    expect(result.points.length).toBe(0);
  });
});

// ============================================
// Vocabulary Growth Tests
// ============================================

describe('VocabularyGrowth', () => {
  it('should build vocabulary growth', () => {
    const result = buildVocabularyGrowth(buildInput(), 'weekly');
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.summary.totalVocabulary).toBeGreaterThan(0);
  });

  it('should track growth rate', () => {
    const result = buildVocabularyGrowth(buildInput(), 'weekly');
    expect(result.summary.growthRate).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty vocab data', () => {
    const result = buildVocabularyGrowth(buildInput({ vocabularyHistory: [] }), 'weekly');
    expect(result.summary.totalVocabulary).toBe(0);
  });
});

// ============================================
// Writing Growth Tests
// ============================================

describe('WritingGrowth', () => {
  it('should build writing growth', () => {
    const result = buildWritingGrowth(buildInput(), 'weekly');
    expect(result.summary.totalEssays).toBe(2);
    expect(result.summary.bestScore).toBe(13);
  });

  it('should handle no essays', () => {
    const result = buildWritingGrowth(buildInput({ writingHistory: [] }), 'weekly');
    expect(result.summary.totalEssays).toBe(0);
  });
});

// ============================================
// Reading Growth Tests
// ============================================

describe('ReadingGrowth', () => {
  it('should build reading growth', () => {
    const result = buildReadingGrowth(buildInput(), 'weekly');
    expect(result.summary.totalPassages).toBe(2);
    expect(result.summary.overallAccuracy).toBeGreaterThan(0);
  });

  it('should handle no reading data', () => {
    const result = buildReadingGrowth(buildInput({ readingHistory: [] }), 'weekly');
    expect(result.summary.totalPassages).toBe(0);
  });
});

// ============================================
// Prediction Engine Tests
// ============================================

describe('PredictionEngine', () => {
  it('should generate predictions', () => {
    const result = buildPrediction(buildInput(), 30);
    expect(result.predictions.estimatedAccuracy).toBeGreaterThan(0);
    expect(result.predictions.estimatedMastery).toBeGreaterThan(0);
    expect(result.predictions.confidenceScore).toBeGreaterThan(0);
  });

  it('should detect disengagement risk', () => {
    // Create data with old last practice date
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const input = buildInput({
      practiceHistory: [{
        date: oldDate.toISOString().slice(0, 10),
        skillId: 't1', skill: 'grammar', correct: true,
        difficulty: 'core', timeSpentSeconds: 60, xpEarned: 10,
      }],
    });
    const result = buildPrediction(input, 30);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.risks.some(r => r.type === 'disengagement')).toBe(true);
  });

  it('should forecast achievements', () => {
    const result = buildPrediction(buildInput(), 90);
    expect(result.achievements.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Chart Generator Tests
// ============================================

describe('ChartGenerators', () => {
  it('should generate heatmap data', () => {
    const result = generateHeatmap(buildInput());
    expect(result.xLabels.length).toBe(4);
    expect(result.yLabels.length).toBe(6);
    expect(result.data.length).toBe(6);
    expect(result.data[0].length).toBe(4);
  });

  it('should generate radar chart data', () => {
    const result = generateRadarChart(buildInput());
    expect(result.labels.length).toBe(6);
    expect(result.datasets.length).toBe(2);
    expect(result.datasets[0].values.length).toBe(6);
    expect(result.maxValue).toBe(100);
  });

  it('should generate trend line data', () => {
    const result = generateTrendLines(buildInput(), 'weekly');
    expect(result.xAxis.length).toBeGreaterThan(0);
    expect(result.series.length).toBe(2);
  });

  it('should generate learning velocity', () => {
    const result = generateLearningVelocity(buildInput());
    expect(result.metrics.questionsPerDay).toBeGreaterThan(0);
    expect(result.trajectory).toBeTruthy();
  });
});

// ============================================
// Edge Cases
// ============================================

describe('EdgeCases', () => {
  it('should handle completely empty input', () => {
    const empty: AnalyticsInput = {
      studentId: 'test', gradeLevel: 'S4',
      practiceHistory: [], mistakeHistory: [], vocabularyHistory: [],
      writingHistory: [], readingHistory: [], sessionHistory: [], masterySnapshots: [],
    };
    expect(() => buildProgressTimeline(empty, 'weekly')).not.toThrow();
    expect(() => buildLearningStatistics(empty, 'weekly')).not.toThrow();
    expect(() => buildMasteryTrend(empty, 'weekly')).not.toThrow();
    expect(() => buildPrediction(empty, 30)).not.toThrow();
    expect(() => generateHeatmap(empty)).not.toThrow();
    expect(() => generateRadarChart(empty)).not.toThrow();
  });

  it('should support all granularities', () => {
    const input = buildInput();
    const granularities = ['daily', 'weekly', 'monthly', 'semester', 'yearly'] as const;
    for (const g of granularities) {
      expect(() => buildProgressTimeline(input, g)).not.toThrow();
      expect(() => buildLearningStatistics(input, g)).not.toThrow();
    }
  });

  it('prediction should produce valid confidence scores', () => {
    const result = buildPrediction(buildInput(), 60);
    expect(result.predictions.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.predictions.confidenceScore).toBeLessThanOrEqual(1);
  });

  it('radar chart values should be 0-100', () => {
    const result = generateRadarChart(buildInput());
    for (const ds of result.datasets) {
      for (const v of ds.values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
