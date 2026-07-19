// Sprint 25: Long-term Learning Memory — types
import type { SkillDimension } from '@/modules/profile/types';

export interface LearningMemory {
  studentId: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  grammar: GrammarMemory;
  vocabulary: VocabularyMemory;
  writingStyle: WritingStyleMemory;
  readingPreference: ReadingPreferenceMemory;
  learningSpeed: LearningSpeedMemory;
  preferredTopics: PreferredTopicsMemory;
  weaknesses: WeaknessMemory;
  strengths: StrengthMemory;
  recentErrors: RecentErrorsMemory;
  reviewHistory: ReviewHistoryMemory;
}

export interface GrammarMemory {
  masteredTopics: string[];
  strugglingTopics: Array<{ topic: string; topicZh: string; errorRate: number; lastPracticed: string }>;
  recommendedFocus: string[];
  commonMistakeTypes: Array<{ type: string; count: number }>;
  overallGrammarLevel: string; // CEFR
}

export interface VocabularyMemory {
  knownWords: number;
  activeWords: number;
  passiveWords: number;
  recentlyLearned: Array<{ word: string; addedAt: string; masteryStars: number }>;
  frequentlyConfused: Array<{ word1: string; word2: string; timesConfused: number }>;
  preferredDifficulty: string;
  vocabularyGrowthRate: number; // words per week
}

export interface WritingStyleMemory {
  averageEssayLength: number; // words
  preferredTextTypes: string[];
  commonChinglishPatterns: Array<{ pattern: string; patternZh: string; occurrences: number }>;
  vocabularyRichness: number; // 0-1
  sentenceComplexity: number; // 0-1
  organizationalStyle: string;
  frequentMistakes: Array<{ type: string; count: number }>;
}

export interface ReadingPreferenceMemory {
  preferredTopics: string[];
  preferredTextTypes: string[];
  averageReadingSpeed: number; // words per minute
  comprehensionLevel: string; // CEFR
  challengingTopics: string[];
  preferredDifficulty: string;
}

export interface LearningSpeedMemory {
  questionsPerDay: number;
  sessionsPerWeek: number;
  averageSessionDuration: number; // minutes
  consistencyScore: number; // 0-1
  bestStudyTime: string; // morning/afternoon/evening
  streakRecord: number;
  completionRate: number; // 0-1
}

export interface PreferredTopicsMemory {
  topTopics: Array<{ topic: string; topicZh: string; engagementScore: number; accuracy: number }>;
  avoidedTopics: string[];
  topicDiversity: number; // 0-1
  recommendedNewTopics: string[];
}

export interface WeaknessMemory {
  persistentWeaknesses: Array<{ skill: SkillDimension; topic: string; topicZh: string; duration: number; severity: string }>;
  emergingWeaknesses: Array<{ skill: SkillDimension; topic: string; topicZh: string; detectedAt: string }>;
  resolvedWeaknesses: Array<{ skill: SkillDimension; topic: string; resolvedAt: string }>;
  weakestSkills: SkillDimension[];
}

export interface StrengthMemory {
  strongestSkills: SkillDimension[];
  topPerformingTopics: Array<{ skill: SkillDimension; topic: string; topicZh: string; accuracy: number }>;
  consistentStrengths: string[];
}

export interface RecentErrorsMemory {
  last10Errors: Array<{ question: string; studentAnswer: string; correctAnswer: string; category: string; timestamp: string }>;
  errorFrequency: Record<string, number>;
  mostRecentErrorCategory: string;
  errorTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface ReviewHistoryMemory {
  totalReviews: number;
  reviewsThisWeek: number;
  averageReviewScore: number; // SM-2 quality 0-5
  overdueReviews: number;
  nextReviewDates: Array<{ itemId: string; itemType: string; dueDate: string }>;
  reviewStreak: number;
}

// ============================================
// Memory Context (for injecting into prompts)
// ============================================

export interface LearningContext {
  studentId: string;
  summary: string;         // English summary for AI prompts
  summaryZh: string;       // Chinese summary for display
  keyMetrics: {
    overallAccuracy: number;
    streakDays: number;
    totalQuestions: number;
    activeSkills: SkillDimension[];
    needsFocus: SkillDimension[];
  };
  personalizationHints: string[];  // Hints for prompt generation
  avoidTopics: string[];           // Topics to avoid (already mastered or disengaged)
  suggestedDifficulty: string;     // remedial/core/challenge
}
