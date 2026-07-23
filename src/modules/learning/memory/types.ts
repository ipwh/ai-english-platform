// Sprint 25: Long-term Learning Memory — types
import type { SkillDimension } from '@/modules/student/profile/types';

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
// Sprint 36: Long-term Memory v2 — new sub-memories
// ============================================

export interface ConfidenceMemory {
  overallConfidence: number; // 0-1
  confidenceBySkill: Record<string, number>; // skill → confidence
  calibrationAccuracy: number; // self-assessment vs actual gap
  overconfidentTopics: string[];
  underconfidentTopics: string[];
  confidenceTrend: 'improving' | 'stable' | 'declining';
  lastSelfAssessment?: string;
}

export interface MotivationMemory {
  motivationLevel: number; // 0-1
  intrinsicMotivation: number; // 0-1 (learning for interest)
  extrinsicMotivation: number; // 0-1 (learning for exams/grades)
  motivationTrend: 'improving' | 'stable' | 'declining';
  burnoutRisk: number; // 0-1
  engagementScore: number; // 0-1
  recentAchievements: string[];
  demotivationTriggers: string[];
}

export interface LearningHabitsMemory {
  preferredStudyTime: 'morning' | 'afternoon' | 'evening' | 'night';
  averageSessionLength: number; // minutes
  sessionsPerWeek: number;
  weekendWarrior: boolean; // studies mostly on weekends
  distractionPatterns: string[];
  focusLevel: number; // 0-1
  noteTakingStyle: 'minimal' | 'moderate' | 'comprehensive';
  reviewConsistency: number; // 0-1
  procrastinationIndex: number; // 0-1 (higher = more procrastination)
}

// ============================================
// Extended LearningMemory (v2)
// ============================================

export interface LearningMemoryV2 extends LearningMemory {
  confidence: ConfidenceMemory;
  motivation: MotivationMemory;
  learningHabits: LearningHabitsMemory;
  lastDecayApplied: string; // ISO date when decay was last computed
  memoryFreshness: number; // 0-1 overall memory quality
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

// ============================================
// Sprint 36: Memory Profile + Influence types
// ============================================

export interface MemoryProfile {
  studentId: string;
  generatedAt: string;
  overallMetrics: {
    memoryFreshness: number;
    totalKnowledgePoints: number;
    masteryPercentage: number;
    learningVelocity: number; // items mastered per week
    reviewCompliance: number;
  };
  skillProfiles: Record<string, {
    level: string;
    confidence: number;
    strengthCount: number;
    weaknessCount: number;
    recommendedAction: string;
  }>;
  confidence: ConfidenceMemory;
  motivation: MotivationMemory;
  learningHabits: LearningHabitsMemory;
  topStrengths: string[];
  criticalWeaknesses: string[];
  nextMilestones: string[];
  nextMilestonesZh: string[];
}

export interface MemoryInfluence {
  /** How memory should influence prompt generation */
  promptModifiers: string[];
  promptModifiersZh: string[];
  /** How memory should influence exercise selection */
  exercisePreferences: {
    preferredFormats: string[];
    topicsToFocus: string[];
    topicsToAvoid: string[];
    difficultyBias: 'remedial' | 'core' | 'challenge';
  };
  /** How memory should influence feedback style */
  feedbackPreferences: {
    detailLevel: 'minimal' | 'balanced' | 'detailed';
    includeExamples: boolean;
    includeChinglishWarnings: boolean;
    tonePreference: 'encouraging' | 'direct' | 'analytical';
  };
  /** How memory should influence recommendations */
  recommendationModifiers: {
    prioritizeWeaknesses: boolean;
    prioritizeInterests: boolean;
    includeChallengeContent: boolean;
    suggestedStrategies: string[];
  };
}

export interface DecayResult {
  memoryId: string;
  appliedAt: string;
  previousFreshness: number;
  newFreshness: number;
  decayedItems: number;
  archivedItems: number;
}

export interface RefreshResult {
  memoryId: string;
  refreshedAt: string;
  itemsRefreshed: number;
  newTopicsDetected: number;
  resolvedWeaknesses: number;
  updatedSkills: string[];
}
