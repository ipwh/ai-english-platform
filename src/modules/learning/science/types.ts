// Sprint 30: AI Learning Science — types

export interface SpacedRepetitionState {
  itemId: string;
  interval: number;          // Days until next review
  easeFactor: number;         // SM-2 ease factor (default 2.5, min 1.3)
  repetitions: number;        // Number of successful reviews
  lastReviewedAt: string;
  nextReviewAt: string;
  quality: number;            // 0-5 SM-2 quality rating
  lapses: number;             // Number of times forgotten
}

export interface ForgettingCurvePoint {
  elapsedMinutes: number;
  retentionProbability: number;
}

export interface RetrievalPracticeSession {
  sessionId: string;
  items: RetrievalItem[];
  schedule: 'immediate' | 'spaced' | 'interleaved';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface RetrievalItem {
  itemId: string;
  question: string;
  answer: string;
  lastAttempted?: string;
  timesCorrect: number;
  timesIncorrect: number;
  retrievalStrength: number;   // 0-1
}

export interface InterleavingPlan {
  topics: string[];
  sequence: InterleavingBlock[];
  rationale: string;
}

export interface InterleavingBlock {
  topic: string;
  itemCount: number;
  difficulty: number;          // 1-5
  type: 'new' | 'review' | 'challenge';
}

export interface DesirableDifficultyConfig {
  targetAccuracy: number;      // 0.7-0.85 is optimal
  currentAccuracy: number;
  adjustment: 'increase' | 'decrease' | 'maintain';
  suggestedDifficulty: 'remedial' | 'core' | 'challenge';
  adaptiveFactor: number;
}

export interface MetacognitionPrompt {
  beforePractice: string[];
  afterPractice: string[];
  selfAssessmentScale: number;  // 1-5
  calibrationGap: number;       // self-assessment minus actual
}

export interface ConfidenceWeightedMastery {
  itemId: string;
  estimatedMastery: number;     // 0-1 (IRT theta equivalent)
  confidence: number;           // 0-1 (certainty of estimate)
  lastUpdated: string;
  priorMastery: number;
  evidenceStrength: number;     // Number of data points
  isMastered: boolean;
}

export interface LearningScienceReport {
  studentId: string;
  generatedAt: string;
  forgettingCurve: { itemsOverTime: ForgettingCurvePoint[]; averageRetention: number };
  retrievalStrength: { strong: number; moderate: number; weak: number };
  interleavingReadiness: number;         // 0-1
  desirableDifficultyAlignment: number;  // 0-1
  metacognitionAccuracy: number;         // calibration gap
  masteryConfidence: { mastered: number; learning: number; unknown: number };
  recommendations: string[];
  recommendationsZh: string[];
}

// ============================================
// Sprint 33: Learning Science Engine — new types
// ============================================

export type ItemType = 'knowledge-node' | 'vocabulary' | 'mistake' | 'grammar' | 'skill';
export type DifficultyLevel = 'remedial' | 'core' | 'challenge';
export type DifficultyDirection = 'increase' | 'decrease' | 'maintain';
export type ReviewUrgency = 'critical' | 'high' | 'medium' | 'low';
export type LearningStrategy = 'spaced-repetition' | 'retrieval-practice' | 'interleaving' | 'desirable-difficulty' | 'active-recall' | 'confidence-based' | 'reflection';

export interface ReviewScheduleEntry {
  id?: string;
  studentId: string;
  itemId: string;
  itemType: ItemType;
  skillDimension?: string;
  title?: string;
  titleZh?: string;
  // SM-2 state
  interval: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  quality: number;
  // Bayesian mastery
  estimatedMastery: number;
  masteryConfidence: number;
  evidenceCount: number;
  isMastered: boolean;
  // Difficulty
  currentDifficulty: DifficultyLevel;
  difficultyAdjustment: DifficultyDirection;
  adaptiveFactor: number;
  // Retrieval
  retrievalStrength: number;
  timesCorrect: number;
  timesIncorrect: number;
  // Forgetting curve
  reviewStrength: number;
  retentionProbability: number;
  // Reflection
  lastReflection?: string;
  reflectionNotes?: string;
  // Scheduling
  lastReviewedAt?: string;
  nextReviewAt: string;
  reviewPriority: number;
  reviewUrgency: ReviewUrgency;
  // Recommendation
  recommendationReason?: string;
  recommendationReasonZh?: string;
  recommendedStrategy?: LearningStrategy;
}

export interface LearningSessionInput {
  studentId: string;
  items: Array<{
    itemId: string;
    itemType: ItemType;
    skillDimension?: string;
    title?: string;
    titleZh?: string;
    correct: boolean;
    quality: number; // 0-5 SM-2
    responseTimeMs?: number;
    difficulty?: DifficultyLevel;
  }>;
  sessionDurationMs?: number;
}

export interface LearningSessionOutput {
  studentId: string;
  sessionId: string;
  generatedAt: string;
  items: ReviewScheduleEntry[];
  summary: {
    totalItems: number;
    correctCount: number;
    incorrectCount: number;
    averageQuality: number;
    averageRetention: number;
    masteredCount: number;
    newMasteries: string[];
    dueForReview: number;
    urgentCount: number;
  };
  difficultyRecommendations: Array<{
    itemId: string;
    from: DifficultyLevel;
    to: DifficultyLevel;
    reason: string;
  }>;
  reflectionPrompts: string[];
  nextSessionRecommendation: string;
}

export interface EffectivenessReport {
  studentId: string;
  period: { start: string; end: string };
  metrics: {
    averageRetention: number;
    retentionTrend: 'improving' | 'stable' | 'declining';
    averageMasteryGain: number;
    itemsMastered: number;
    itemsRegressed: number;
    optimalDifficultyRate: number; // % of items in sweet spot (70-85%)
    averageCalibration: number; // self-assessment vs actual gap
    reviewCompliance: number; // % of due items reviewed on time
    timeToMastery: number; // average days to mastery
  };
  recommendations: string[];
  recommendationsZh: string[];
}
