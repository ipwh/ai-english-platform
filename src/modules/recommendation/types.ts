// Sprint 22: Adaptive Recommendation Engine — types
import type { SkillDimension } from '@/modules/profile/types';
import type { CEFRLevel, HKDSELevel } from '@/modules/knowledge-graph/types';

// ============================================
// Recommendation Input
// ============================================

export interface RecommendationInput {
  studentId: string;
  gradeLevel: string;
  /** Knowledge graph mastery data per node */
  masteryScores: MasteryScoreEntry[];
  /** Learning profile aggregated stats */
  learningProfile: LearningProfileSnapshot;
  /** Mistake patterns and frequencies */
  mistakeStats: MistakeStatsSnapshot;
  /** Recent session history */
  sessionHistory: SessionSnapshot[];
  /** Preferred topics from engagement analysis */
  preferredTopics: TopicPreferenceSnapshot[];
  /** Available study time in minutes */
  availableStudyTime: number;
  /** Optional: force a specific skill focus */
  focusSkill?: SkillDimension;
  /** Maximum recommendations to return */
  maxRecommendations?: number;
}

export interface MasteryScoreEntry {
  nodeId: string;
  skill: SkillDimension;
  title: string;
  titleZh: string;
  cefr: CEFRLevel;
  hkdseLevel: HKDSELevel;
  difficulty: number;
  currentMastery: number;
  masteryThreshold: number;
  accuracy: number;
  totalAttempts: number;
  daysSinceLastPractice: number;
  estimatedLearningTime: number;
}

export interface LearningProfileSnapshot {
  overallAccuracy: number;
  totalPracticeSessions: number;
  totalQuestionsAnswered: number;
  currentStreak: number;
  questionsPerSession: number;
  sessionsLast7Days: number;
  vocabularyStats: {
    total: number;
    mastered: number;
    learning: number;
    dueForReview: number;
  };
}

export interface MistakeStatsSnapshot {
  totalMistakes: number;
  reviewedCount: number;
  pendingReviewCount: number;
  /** Mistakes by category: grammar, vocabulary, comprehension, etc. */
  byCategory: Record<string, number>;
  /** Top mistake grammar points with counts */
  topGrammarPoints: Array<{ point: string; count: number }>;
  /** Recent mistake velocity */
  recent7Days: number;
  recent30Days: number;
}

export interface SessionSnapshot {
  sessionId: string;
  startedAt: Date;
  completedAt?: Date;
  durationMinutes: number;
  questionsAnswered: number;
  correctCount: number;
  skillFocus?: SkillDimension;
  topicsCovered: string[];
}

export interface TopicPreferenceSnapshot {
  topic: string;
  category: string;
  engagementCount: number;
  averageScore: number;
}

// ============================================
// Recommendation Output
// ============================================

export type RecommendationType =
  | 'next-exercise'
  | 'review-exercise'
  | 'vocabulary-review'
  | 'grammar-review'
  | 'reading-recommendation'
  | 'writing-recommendation'
  | 'listening-recommendation'
  | 'speaking-recommendation';

export interface Recommendation {
  /** Unique recommendation ID */
  id: string;
  /** Type of recommendation */
  type: RecommendationType;
  /** Target skill dimension */
  skill: SkillDimension;
  /** Target node/topic ID */
  nodeId: string;
  /** English title */
  title: string;
  /** Chinese title */
  titleZh: string;
  /** Human-readable reason (English) */
  reason: string;
  /** Human-readable reason (Chinese) */
  reasonZh: string;
  /** Confidence score 0-1 */
  confidenceScore: number;
  /** Estimated time to complete in minutes */
  estimatedTime: number;
  /** Difficulty rating 1-5 */
  difficulty: number;
  /** Expected learning gain 0-100 */
  expectedLearningGain: number;
  /** Priority: must-do, should-do, could-do */
  priority: 'must-do' | 'should-do' | 'could-do';
  /** CEFR level */
  cefr: CEFRLevel;
  /** Strategy that generated this recommendation */
  strategy: string;
  /** Timestamp of generation */
  generatedAt: Date;
}

export interface RecommendationResult {
  studentId: string;
  generatedAt: Date;
  /** Total available study time budget */
  availableStudyTime: number;
  /** Total estimated time for all recommendations */
  totalEstimatedTime: number;
  /** All recommendations sorted by priority */
  recommendations: Recommendation[];
  /** Summary counts by type */
  summary: {
    total: number;
    byType: Record<string, number>;
    byPriority: { mustDo: number; shouldDo: number; couldDo: number };
    bySkill: Record<string, number>;
  };
  /** Diagnostic info */
  diagnostics: {
    inputsProcessed: string[];
    strategiesUsed: string[];
    generationTimeMs: number;
  };
}

// ============================================
// Strategy Types
// ============================================

export interface StrategyContext {
  input: RecommendationInput;
  now: Date;
}

export interface StrategyResult {
  recommendations: Recommendation[];
  strategy: string;
  confidence: number;
}

export interface RecommendationStrategy {
  /** Strategy name */
  name: string;
  /** Priority weight (higher = more important) */
  weight: number;
  /** Whether this strategy applies to the given context */
  applies(context: StrategyContext): boolean;
  /** Generate recommendations */
  generate(context: StrategyContext): StrategyResult;
  /** Get explanation for a recommendation type */
  explain(recommendation: Recommendation, context: StrategyContext): { reason: string; reasonZh: string };
}

// ============================================
// Scoring Types
// ============================================

export interface ScoreFactors {
  /** Mastery gap: how far below threshold (0-1, higher = more urgent) */
  masteryGap: number;
  /** Recency: days since last practice (normalized 0-1) */
  recency: number;
  /** Mistake frequency for this skill (normalized 0-1) */
  mistakeFrequency: number;
  /** Topic preference match (0-1) */
  preferenceMatch: number;
  /** Learning path position (0-1, higher = next in sequence) */
  pathPosition: number;
  /** Prerequisite readiness (0-1) */
  prerequisiteReadiness: number;
  /** Time fit: does it fit in available time? (0-1) */
  timeFit: number;
  /** Streak bonus: reward consistency (0-1) */
  streakBonus: number;
  /** SRS urgency: spaced repetition due items (0-1) */
  srsUrgency: number;
}

export interface ScoredRecommendation extends Recommendation {
  /** Raw score factors for transparency */
  scoreFactors: ScoreFactors;
  /** Composite score 0-100 */
  compositeScore: number;
}
