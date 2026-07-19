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
