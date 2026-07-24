// ============================================
// Sprint 113: Question Quality Types
// Deterministic question quality validation. No AI.
// ============================================

export type QualityDecision = 'excellent' | 'good' | 'acceptable' | 'needs_improvement';

export interface QualityDimensions {
  questionDesign: number;   // Stem clarity, answer uniqueness
  distractorQuality: number; // Plausibility, similarity
  evidenceSupport: number;  // Reading/listening passage alignment
  difficulty: number;       // Appropriate level, balanced
  clarity: number;          // No ambiguity, clear references
  pedagogy: number;         // Educationally sound
  variety: number;          // Template rotation, pattern diversity
  overall: number;
}

export const QUALITY_WEIGHTS: Record<keyof Omit<QualityDimensions, 'overall'>, number> = {
  questionDesign: 0.20,
  distractorQuality: 0.20,
  evidenceSupport: 0.15,
  difficulty: 0.15,
  clarity: 0.15,
  pedagogy: 0.10,
  variety: 0.05,
};

export interface QualityCheck {
  ruleId: string;
  passed: boolean;
  score: number;
  detail?: string;
  questionIndex: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface QuestionQualityResult {
  decision: QualityDecision;
  dimensions: QualityDimensions;
  score: number;
  checks: QualityCheck[];
  warnings: string[];
  recommendations: string[];
  metadata: {
    totalChecks: number;
    passed: number;
    failed: number;
    questionCount: number;
    durationMs: number;
  };
}

export interface QuestionQualityRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  check(questions: Record<string, unknown>[], context?: QualityContext): QualityCheck[];
}

export interface QualityContext {
  questionType?: string;
  targetLevel?: string;
  targetCEFR?: string;
  passageContent?: string;
  transcriptContent?: string;
  answerHistory?: string[]; // For distribution tracking
  metadata?: Record<string, unknown>;
}

export function calculateQualityScore(dims: Omit<QualityDimensions, 'overall'>): QualityDimensions {
  const overall = Math.round(
    dims.questionDesign * QUALITY_WEIGHTS.questionDesign +
    dims.distractorQuality * QUALITY_WEIGHTS.distractorQuality +
    dims.evidenceSupport * QUALITY_WEIGHTS.evidenceSupport +
    dims.difficulty * QUALITY_WEIGHTS.difficulty +
    dims.clarity * QUALITY_WEIGHTS.clarity +
    dims.pedagogy * QUALITY_WEIGHTS.pedagogy +
    dims.variety * QUALITY_WEIGHTS.variety,
  );
  return { ...dims, overall: Math.max(0, Math.min(100, overall)) };
}

export function determineQualityDecision(score: number): QualityDecision {
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'good';
  if (score >= 70) return 'acceptable';
  return 'needs_improvement';
}

export function createQualityDimensions(): Omit<QualityDimensions, 'overall'> {
  return {
    questionDesign: 100, distractorQuality: 100, evidenceSupport: 100,
    difficulty: 100, clarity: 100, pedagogy: 100, variety: 100,
  };
}
