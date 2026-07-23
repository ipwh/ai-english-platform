// Sprint 59: Canonical StudentState — the ONE immutable student state
// StudentStateBuilder is the ONLY component allowed to assemble this.
// All services consume this; none compute their own version.

import type { LearningPersona, KnowledgeState, MotivationState,
  ConfidenceState, LearningHabit, TwinPredictions, RiskAssessment,
  RetentionState, ForgetCurve, LearningVelocity, RecoveryMetrics,
  SkillRank } from '@/modules/student-twin/types';

// ============================================
// StudentState — complete canonical state
// ============================================

export interface StudentState {
  /** Student identity */
  identity: StudentIdentity;
  /** Memory / learning data from learning-memory engine */
  memory: StudentMemory | null;
  /** Mastery scores from student-mastery service (canonical source) */
  mastery: StudentMastery;
  /** Weakness profile from mistake-intelligence */
  weakness: StudentWeakness | null;
  /** Vocabulary profile from vocabulary-intelligence */
  vocabulary: StudentVocabulary | null;
  /** XP, streak, badges from user-repo */
  engagement: StudentEngagement;
  /** Practice history summary */
  practice: StudentPracticeSummary;
  /** Derived: learning persona */
  persona: LearningPersona;
  /** Derived: knowledge state */
  knowledge: KnowledgeState;
  /** Derived: motivation */
  motivation: MotivationState;
  /** Derived: confidence */
  confidence: ConfidenceState;
  /** Derived: habits */
  habits: LearningHabit;
  /** Derived: predictions */
  predictions: TwinPredictions;
  /** Derived: risk assessment */
  risks: RiskAssessment;
  /** Derived: retention state */
  retention: RetentionState;
  /** Derived: forgetting curve */
  forgetCurve: ForgetCurve;
  /** Derived: learning velocity */
  velocity: LearningVelocity;
  /** Derived: recovery metrics */
  recovery: RecoveryMetrics;
  /** Timestamp */
  generatedAt: string;
}

// ============================================
// Sub-types (canonical sources)
// ============================================

export interface StudentIdentity {
  id: string;
  email: string;
  nameZh: string | null;
  nameEn: string | null;
  role: string;
  level: string | null;
  classId: string | null;
  className: string | null;
  gradeLevel: string | null;
  academicYear: string | null;
}

export interface StudentMemory {
  learningSpeed?: {
    consistencyScore?: number; sessionsPerWeek?: number;
    averageSessionDuration?: number; completionRate?: number;
  };
  motivation?: {
    motivationLevel?: number; intrinsicMotivation?: number;
    extrinsicMotivation?: number; motivationTrend?: string;
    engagementScore?: number; burnoutRisk?: number;
    recentAchievements?: string[];
  };
  confidence?: {
    overallConfidence?: number; confidenceBySkill?: Record<string, number>;
    calibrationAccuracy?: number; confidenceTrend?: string;
  };
  learningHabits?: {
    procrastinationIndex?: number; preferredTimeOfDay?: string;
    avgSessionLength?: number; distractionTendency?: number;
    focusLevel?: number; distractionPatterns?: string[];
  };
}

export interface StudentMastery {
  overallScore: number; // 0-100
  bySkill: Record<string, {
    score: number;
    practiceCount: number;
    mistakeCount: number;
    correctCount: number;
  }>;
  weakSkills: string[];
  strongSkills: string[];
  estimatedHkdseLevel: string;
  estimatedCefrLevel: string;
}

export interface StudentWeakness {
  topWeaknesses: Array<{
    name: string; nameZh?: string;
    frequency: number; accuracy: number;
    trend: 'improving' | 'stable' | 'declining';
    recommendation?: string; recommendationZh?: string;
  }>;
  totalMistakes: number;
  generatedAt: Date;
}

export interface StudentVocabulary {
  total: number;
  byStatus: Record<string, number>;
  reviewQueue: number;
  generatedAt: Date;
}

export interface StudentEngagement {
  xp: number;
  level: number;
  streakDays: number;
  badges: string[];
  overallAccuracy: number | null;
}

export interface StudentPracticeSummary {
  totalSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  recentSessions: number; // last 30 days
}
