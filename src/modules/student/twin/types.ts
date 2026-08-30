// Sprint 37: Student Digital Twin — types
import type { SkillDimension } from '@/modules/student/profile/types';
import type { CEFRLevel, HKDSELevel } from '@/modules/knowledge-graph/types';
import type { ForgettingCurvePoint } from '@/modules/learning/science/types';

// ============================================
// StudentTwin — complete digital representation
// ============================================

export interface StudentTwin {
  studentId: string;
  generatedAt: string;
  persona: LearningPersona;
  knowledge: KnowledgeState;
  motivation: MotivationState;
  confidence: ConfidenceState;
  habits: LearningHabit;
  predictions: TwinPredictions;
  risks: RiskAssessment;
  dashboard: DashboardData;
  goals: LearningGoals;
  recommendations: RecommendationSummary[];
  retention: RetentionState;
  forgetCurve: ForgetCurve;
  /** v5: Learning velocity metrics */
  velocity: LearningVelocity;
  /** v5: Recovery & compliance metrics */
  recovery: RecoveryMetrics;
}

// ============================================
// LearningPersona — derived learning profile
// ============================================

export interface LearningPersona {
  type: PersonaType;
  typeZh: string;
  description: string;
  descriptionZh: string;
  traits: string[];
  traitsZh: string[];
  recommendedApproach: string;
  recommendedApproachZh: string;
}

export type PersonaType =
  | 'steady-grinder' | 'fast-learner' | 'struggling-but-persistent'
  | 'high-potential-unfocused' | 'exam-crammer' | 'balanced-achiever'
  | 'curious-explorer' | 'anxious-perfectionist';

// ============================================
// KnowledgeState — current + predicted knowledge
// ============================================

export interface KnowledgeState {
  /** Mastery scores per skill dimension */
  currentMastery: Record<string, number>;
  /** Predicted mastery in 7/30/90 days */
  predictedMastery: {
    '7d': Record<string, number>;
    '30d': Record<string, number>;
    '90d': Record<string, number>;
  };
  /** Skills ordered by strength */
  strongSkills: SkillRank[];
  /** Skills ordered by weakness */
  weakSkills: SkillRank[];
  /** Overall HKDSE estimated level */
  estimatedHkdseLevel: string;
  /** Overall CEFR estimated level */
  estimatedCefrLevel: CEFRLevel;
  /** Total knowledge nodes mastered */
  nodesMastered: number;
  /** Total knowledge nodes in curriculum */
  totalNodes: number;
  /** Learning velocity (nodes mastered per week) */
  learningVelocity: number;
  /** Knowledge retention rate */
  retentionRate: number;
}

export interface SkillRank {
  skill: string;
  skillZh?: string;
  currentScore: number;
  predictedScore: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number;
}

// ============================================
// MotivationState
// ============================================

export interface MotivationState {
  overallScore: number; // 0-1
  intrinsic: number;
  extrinsic: number;
  trend: 'improving' | 'stable' | 'declining';
  engagementLevel: number;
  consistencyScore: number;
  burnoutRisk: number;
  dropoutRisk: number;
  recentAchievements: string[];
  suggestedMotivators: string[];
  suggestedMotivatorsZh: string[];
}

// ============================================
// ConfidenceState
// ============================================

export interface ConfidenceState {
  overallConfidence: number; // 0-1
  perSkill: Record<string, number>;
  calibrationAccuracy: number; // how well self-assessment matches actual
  overconfidentIn: string[];
  underconfidentIn: string[];
  confidenceTrend: 'improving' | 'stable' | 'declining';
  suggestedConfidenceBoosters: string[];
  suggestedConfidenceBoostersZh: string[];
}

// ============================================
// LearningHabit
// ============================================

export interface LearningHabit {
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'night';
  sessionsPerWeek: number;
  avgSessionMinutes: number;
  completionRate: number;
  consistencyScore: number;
  procrastinationIndex: number;
  focusLevel: number;
  fatigueEstimation: number; // 0-1, higher = more fatigued
  optimalSessionLength: number; // recommended minutes
  distractionPatterns: string[];
  improvementSuggestions: string[];
  improvementSuggestionsZh: string[];
}

// ============================================
// TwinPredictions
// ============================================

export interface TwinPredictions {
  /** Predicted HKDSE level in 90 days */
  predictedHkdseLevel: string;
  /** Predicted exam score (0-100) */
  predictedExamScore: number;
  /** Score range with confidence */
  examScoreRange: { low: number; high: number; confidence: number };
  /** Predicted CEFR level in 90 days */
  predictedCefrLevel: CEFRLevel;
  /** Predicted mastery percentages per skill */
  skillPredictions: Array<{
    skill: string;
    currentScore: number;
    predictedScore: number;
    confidence: number;
    estimatedDaysToMastery: number | null;
  }>;
  /** Overall learning trajectory */
  trajectory: 'accelerating' | 'steady' | 'plateauing' | 'declining';
  /** Recommended weekly study time (minutes) */
  recommendedWeeklyMinutes: number;
}

// ============================================
// RiskAssessment
// ============================================

export interface RiskAssessment {
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  dropoutRisk: number; // 0-1
  burnoutRisk: number; // 0-1
  plateauRisk: number; // 0-1
  regressionRisk: number; // 0-1 (risk of losing previously mastered skills)
  examReadiness: number; // 0-1
  riskFactors: string[];
  riskFactorsZh: string[];
  mitigationStrategies: string[];
  mitigationStrategiesZh: string[];
  requiresIntervention: boolean;
  interventionSuggestions: string[];
  interventionSuggestionsZh: string[];
}

// ============================================
// DashboardData — ready-to-render JSON
// ============================================

export interface DashboardData {
  summary: {
    studentId: string;
    personaType: string;
    personaTypeZh: string;
    estimatedLevel: string;
    overallProgress: number; // 0-1
  };
  kpiCards: Array<{
    key: string;
    label: string;
    labelZh: string;
    value: number;
    unit: string;
    trend: 'up' | 'down' | 'stable';
    color: 'green' | 'yellow' | 'red' | 'blue';
  }>;
  skillRadar: Array<{
    skill: string;
    skillZh: string;
    current: number;
    predicted: number;
    maxValue: number;
  }>;
  learningVelocity: Array<{
    week: string;
    velocity: number;
    sessionsCompleted: number;
  }>;
  riskIndicators: Array<{
    type: string;
    label: string;
    labelZh: string;
    level: 'low' | 'moderate' | 'high' | 'critical';
    score: number;
    action: string;
    actionZh: string;
  }>;
  nextMilestones: Array<{
    milestone: string;
    milestoneZh: string;
    progress: number;
    estimatedDays: number;
  }>;
  strengths: string[];
  weaknesses: string[];
  recentActivity: Array<{ action: string; timestamp: string }>;
  suggestedActions: string[];
  suggestedActionsZh: string[];
}

// ============================================
// LearningGoals — derived from weakness + exam targets (v4.1)
// ============================================

export interface LearningGoals {
  /** Short-term goals (next 7 days) */
  shortTerm: LearningGoal[];
  /** Medium-term goals (next 30 days) */
  mediumTerm: LearningGoal[];
  /** Target HKDSE level */
  targetHkdseLevel: string;
  /** Target overall mastery */
  targetMastery: number;
}

export interface LearningGoal {
  skill: string;
  skillZh: string;
  currentScore: number;
  targetScore: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  reasonZh: string;
}

// ============================================
// RecommendationSummary — sourced from LearningFacade (v4.1)
// ============================================

export interface RecommendationSummary {
  type: 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'exercise';
  action: string;
  actionZh: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

// ============================================
// v5: RetentionState — detailed memory retention metrics
// ============================================

export interface RetentionState {
  /** Overall retention rate (0-1) */
  overallRate: number;
  /** Retention rate per skill dimension */
  perSkill: Record<string, number>;
  /** Average days before a skill decays below mastery threshold */
  averageRetentionDays: number;
  /** Skills at risk of being forgotten (retention < 0.5) */
  atRiskSkills: string[];
  /** Skills with strong retention (> 0.8) */
  strongSkills: string[];
  /** Trend direction */
  trend: 'improving' | 'stable' | 'declining';
  /** Recommended review cadence in days */
  recommendedReviewCadence: number;
}

// ============================================
// v5: ForgetCurve — Ebbinghaus decay curves per key skill
// ============================================

export interface ForgetCurve {
  /** Per-skill forgetting curves */
  curves: Record<string, ForgettingCurvePoint[]>;
  /** Overall composite forgetting curve */
  composite: ForgettingCurvePoint[];
  /** Estimated half-life of knowledge (days until 50% retention) */
  knowledgeHalfLifeDays: number;
  /** When the curves were last computed */
  computedAt: string;
}

// ============================================
// v5: LearningVelocity — how fast the student learns
// ============================================

export interface LearningVelocity {
  /** Nodes mastered per week (average over last 4 weeks) */
  weeklyMasteryRate: number;
  /** Average score improvement per practice session */
  improvementPerSession: number;
  /** Weeks to reach target level at current pace */
  estimatedWeeksToTarget: number;
  /** Velocity trend over last 4 weeks */
  weeklyHistory: Array<{ week: string; nodesMastered: number; avgScore: number }>;
  /** Compared to peers (percentile, 0-100); null = 平台無全校比較證據（不杜撰） */
  peerPercentile: number | null;
  /** Acceleration status */
  trend: 'accelerating' | 'steady' | 'decelerating';
}

// ============================================
// v5: RecoveryMetrics — mistake recovery & review compliance
// ============================================

export interface RecoveryMetrics {
  /** Average days to resolve a mistake (from first seen to mastered) */
  avgRecoveryDays: number;
  /** Percentage of mistakes eventually resolved */
  recoveryRate: number; // 0-1
  /** How often the student follows SRS review schedule */
  reviewCompliance: number; // 0-1
  /** Days since last review session */
  daysSinceLastReview: number;
  /** Overdue review items count */
  overdueReviewCount: number;
  /** Streak of consecutive days meeting review target */
  reviewStreak: number;
  /** Whether student is on track with review schedule */
  onTrack: boolean;
}