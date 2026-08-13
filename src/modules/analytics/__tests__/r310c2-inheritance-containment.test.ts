// ============================================
// R3.10-C.2 — N/O: inheritance & containment tests
// N: memory/trend scoring consumes verified-derived accuracy as an
//    explicit input — never recomputes from PracticeSession rows.
// O: analytics API is contained — empty authoritative input, never
//    consumes client session data.
// ============================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateLearningContext } from '@/modules/learning/memory/services/memory-scoring';
import type { LearningMemory } from '@/modules/learning/memory/types';
import {
  buildLearningStatistics,
  type AnalyticsInput,
} from '@/modules/analytics/services/learning-analytics';

function makeMemory(): LearningMemory {
  return {
    studentId: 'student-1',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    version: 1,
    grammar: {
      masteredTopics: ['tenses'],
      strugglingTopics: [],
      recommendedFocus: [],
      commonMistakeTypes: [],
      overallGrammarLevel: 'B1',
    },
    vocabulary: {
      knownWords: 100, activeWords: 40, passiveWords: 60,
      recentlyLearned: [], frequentlyConfused: [],
      preferredDifficulty: 'core', vocabularyGrowthRate: 5,
    },
    writingStyle: {
      averageEssayLength: 120, preferredTextTypes: [], commonChinglishPatterns: [],
      vocabularyRichness: 0.5, sentenceComplexity: 0.5, organizationalStyle: 'standard',
      frequentMistakes: [],
    },
    readingPreference: {
      preferredTopics: [], preferredTextTypes: [], averageReadingSpeed: 100,
      comprehensionLevel: 'B1', challengingTopics: [], preferredDifficulty: 'core',
    },
    learningSpeed: {
      questionsPerDay: 5, sessionsPerWeek: 2, averageSessionDuration: 10,
      consistencyScore: 0.5, bestStudyTime: 'evening', streakRecord: 3, completionRate: 0.8,
    },
    preferredTopics: { topTopics: [], avoidedTopics: [], topicDiversity: 0.5, recommendedNewTopics: [] },
    weaknesses: { persistentWeaknesses: [], emergingWeaknesses: [], resolvedWeaknesses: [], weakestSkills: [] },
    strengths: { strongestSkills: [], topPerformingTopics: [], consistentStrengths: [] },
    recentErrors: { last10Errors: [], errorFrequency: {}, mostRecentErrorCategory: 'grammar', errorTrend: 'stable' },
    reviewHistory: {
      totalReviews: 0, reviewsThisWeek: 0, averageReviewScore: 0,
      overdueReviews: 0, nextReviewDates: [], reviewStreak: 0,
    },
  };
}

function makeInput(overrides: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    studentId: 'student-1',
    gradeLevel: 'S4',
    practiceHistory: [],
    mistakeHistory: [],
    vocabularyHistory: [],
    writingHistory: [],
    readingHistory: [],
    sessionHistory: [],
    masterySnapshots: [],
    ...overrides,
  };
}

describe('R3.10-C.2 N — memory/trend inheritance', () => {
  it('N.1: memory context inherits the verified-derived accuracy verbatim (no recompute)', () => {
    const ctx = generateLearningContext(makeMemory(), 82, 4, 30);
    expect(ctx.keyMetrics.overallAccuracy).toBe(82);
    expect(ctx.keyMetrics.streakDays).toBe(4);
    expect(ctx.keyMetrics.totalQuestions).toBe(30);
  });

  it('N.2: memory scoring has no raw PracticeSession access (pure input)', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '../../learning/memory/services/memory-scoring.ts'), 'utf-8');
    expect(src).not.toContain('practiceSession');
    expect(src).not.toContain('correctCount /');
  });

  it('N.3: learning statistics compute accuracy only from caller-provided rows', () => {
    const result = buildLearningStatistics(makeInput({
      practiceHistory: [
        { date: '2026-08-10', skillId: 'g1', skill: 'grammar', correct: true, difficulty: 'core', timeSpentSeconds: 10, xpEarned: 5 },
        { date: '2026-08-10', skillId: 'g1', skill: 'grammar', correct: false, difficulty: 'core', timeSpentSeconds: 12, xpEarned: 2 },
        { date: '2026-08-11', skillId: 'g1', skill: 'grammar', correct: true, difficulty: 'core', timeSpentSeconds: 8, xpEarned: 5 },
        { date: '2026-08-12', skillId: 'g1', skill: 'grammar', correct: true, difficulty: 'core', timeSpentSeconds: 9, xpEarned: 5 },
      ],
    }), 'monthly');
    expect(result.overview.overallAccuracy).toBe(0.75);
  });

  it('N.4: analytics service is pure — no DB access to recompute session aggregates', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '../services/learning-analytics.ts'), 'utf-8');
    expect(src).not.toContain("from '@/shared/db/db'");
    expect(src).not.toContain('practiceSession');
  });
});

describe('R3.10-C.2 O — analytics API containment', () => {
  it('O.1: /api/analytics builds an empty authoritative input and never consumes client sessions', () => {
    const route = readFileSync(
      resolve(import.meta.dirname, '../../../../src/app/api/analytics/route.ts'), 'utf-8');
    expect(route).toContain('practiceHistory: []');
    expect(route).toContain('sessionHistory: []');
    expect(route).not.toContain('practiceSession');
    // client body is never parsed for scored data:
    expect(route).not.toContain('await request.json()');
  });

  it('O.2: empty analytics input produces empty (zero) statistics — no fabricated data', () => {
    const result = buildLearningStatistics(makeInput(), 'monthly');
    expect(result.overview.overallAccuracy).toBe(0);
    expect(result.overview.totalQuestions).toBe(0);
  });
});
