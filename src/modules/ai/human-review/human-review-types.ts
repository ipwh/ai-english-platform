// ============================================
// Sprint 115: Human Review Types
// Simulates teacher-quality review. 100% deterministic.
// ============================================

import { computeWeightedScore } from '@/shared/utils/weighted-score';

export type HumanReviewDecision = 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | 'reject';

export interface HumanReviewDimensions {
  studentExperience: number;   // 25% — Would a student find this engaging/clear?
  naturalness: number;          // 20% — Does it read like human-written content?
  teachingValue: number;        // 20% — Does it actually teach something?
  authenticity: number;         // 15% — Does it feel like a real exam question?
  fairness: number;             // 10% — Are options balanced? No trick questions?
  confidence: number;           // 10% — How confident is this review?
  overall: number;
}

export const HUMAN_REVIEW_WEIGHTS: Record<keyof Omit<HumanReviewDimensions, 'overall'>, number> = {
  studentExperience: 0.25,
  naturalness: 0.20,
  teachingValue: 0.20,
  authenticity: 0.15,
  fairness: 0.10,
  confidence: 0.10,
};

export interface HumanReviewCheck {
  ruleId: string;
  passed: boolean;
  score: number;
  detail?: string;
  suggestion?: string;
  questionIndex: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface HumanReviewResult {
  decision: HumanReviewDecision;
  dimensions: HumanReviewDimensions;
  score: number;
  checks: HumanReviewCheck[];
  topIssues: string[];
  recommendations: string[];
  warnings: string[];
  metadata: {
    totalChecks: number;
    passed: number;
    failed: number;
    questionCount: number;
    durationMs: number;
  };
}

export interface HumanReviewRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  review(questions: Record<string, unknown>[], context?: HumanReviewContext): HumanReviewCheck[];
}

export interface HumanReviewContext {
  passageType?: string;
  questionType?: string;
  targetLevel?: string;
  targetCEFR?: string;
  passageContent?: string;
  transcriptContent?: string;
  previousQuestions?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

export function calculateHumanReviewScore(dims: Omit<HumanReviewDimensions, 'overall'>): HumanReviewDimensions {
  const overall = computeWeightedScore(dims as Record<string, number>, HUMAN_REVIEW_WEIGHTS as Record<string, number>);
  return { ...dims, overall };
}

export function determineHumanReviewDecision(score: number): HumanReviewDecision {
  if (score >= 95) return 'excellent';
  if (score >= 90) return 'good';
  if (score >= 80) return 'acceptable';
  if (score >= 65) return 'needs_improvement';
  return 'reject';
}

export function createHumanReviewDimensions(): Omit<HumanReviewDimensions, 'overall'> {
  return {
    studentExperience: 100, naturalness: 100, teachingValue: 100,
    authenticity: 100, fairness: 100, confidence: 100,
  };
}
