// ============================================
// Sprint 114: Adaptive Learning Types
// Deterministic personalized learning. No AI.
// ============================================

import { computeWeightedScore } from '@/shared/utils/weighted-score';

export type SkillDomain = 'reading' | 'listening' | 'grammar' | 'vocabulary' | 'writing' | 'integrated';

export type DifficultyLevel = 'remedial' | 'foundation' | 'core' | 'challenge' | 'stretch';

export type AdaptiveDecision = 'excellent_adaptation' | 'good' | 'acceptable' | 'needs_adjustment';

export type RecommendationType = 'review' | 'practice' | 'advance' | 'revision';

export interface SkillScore {
  domain: SkillDomain;
  score: number;        // 0-100
  correctCount: number;
  totalAttempts: number;
  lastUpdated: string;
}

export interface PerformanceRecord {
  timestamp: string;
  domain: SkillDomain;
  skill?: string;
  correct: boolean;
  score: number;
  difficulty: DifficultyLevel;
  questionType?: string;
  durationMs?: number;
}

export interface StudentProfile {
  studentId: string;
  currentLevel: DifficultyLevel;
  targetLevel?: DifficultyLevel;
  targetCEFR?: string;
  skills: SkillScore[];
  recentPerformance: PerformanceRecord[];
  currentStreak: number;     // consecutive correct
  currentLossStreak: number; // consecutive incorrect
  rollingAccuracy: number;   // 0-1 over last 50 questions
  totalQuestionsAnswered: number;
  sessionQuestionsAnswered: number;
  sessionStartTime: string;
  sessionFailures: number;
  config: AdaptiveConfig;
}

export interface AdaptiveConfig {
  /** Target difficulty distribution */
  challengeRatio: { comfortable: number; challenging: number; stretch: number };
  /** Mastery threshold to advance (0-1) */
  masteryThreshold: number;
  /** Failure count to trigger difficulty reduction */
  failureThreshold: number;
  /** Streak to trigger difficulty increase */
  streakThreshold: number;
  /** Max session questions before fatigue reduction */
  maxSessionQuestions: number;
  /** Spaced repetition intervals in hours */
  spacedRepetitionIntervals: number[];
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  challengeRatio: { comfortable: 0.70, challenging: 0.20, stretch: 0.10 },
  masteryThreshold: 0.85,
  failureThreshold: 3,
  streakThreshold: 5,
  maxSessionQuestions: 30,
  spacedRepetitionIntervals: [1, 6, 24, 72, 168, 336], // hours
};

export interface AdaptiveDimensions {
  difficultyMatching: number;
  weakSkillCoverage: number;
  learningProgression: number;
  variety: number;
  studentConfidence: number;
  pedagogicalBalance: number;
  overall: number;
}

export const ADAPTIVE_WEIGHTS: Record<keyof Omit<AdaptiveDimensions, 'overall'>, number> = {
  difficultyMatching: 0.25,
  weakSkillCoverage: 0.25,
  learningProgression: 0.20,
  variety: 0.10,
  studentConfidence: 0.10,
  pedagogicalBalance: 0.10,
};

export interface AdaptiveCheck {
  ruleId: string;
  passed: boolean;
  score: number;
  detail?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface AdaptiveResult {
  decision: AdaptiveDecision;
  dimensions: AdaptiveDimensions;
  score: number;
  checks: AdaptiveCheck[];
  recommendations: RecommendationType[];
  adjustedDifficulty: DifficultyLevel;
  focusSkills: SkillDomain[];
  warnings: string[];
  metadata: { totalChecks: number; passed: number; failed: number; durationMs: number };
}

export interface AdaptiveRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  evaluate(profile: StudentProfile, context?: AdaptiveContext): AdaptiveCheck;
}

export interface AdaptiveContext {
  availableSkills?: SkillDomain[];
  preferredDifficulty?: DifficultyLevel;
  metadata?: Record<string, unknown>;
}

export function calculateAdaptiveScore(dims: Omit<AdaptiveDimensions, 'overall'>): AdaptiveDimensions {
  const overall = computeWeightedScore(dims as Record<string, number>, ADAPTIVE_WEIGHTS as Record<string, number>);
  return { ...dims, overall };
}

export function determineAdaptiveDecision(score: number): AdaptiveDecision {
  if (score >= 95) return 'excellent_adaptation';
  if (score >= 85) return 'good';
  if (score >= 70) return 'acceptable';
  return 'needs_adjustment';
}

export function createAdaptiveDimensions(): Omit<AdaptiveDimensions, 'overall'> {
  return {
    difficultyMatching: 100, weakSkillCoverage: 100, learningProgression: 100,
    variety: 100, studentConfidence: 100, pedagogicalBalance: 100,
  };
}

export const ALL_SKILLS: SkillDomain[] = ['reading', 'listening', 'grammar', 'vocabulary', 'writing', 'integrated'];

export const DIFFICULTY_ORDER: DifficultyLevel[] = ['remedial', 'foundation', 'core', 'challenge', 'stretch'];
