// ============================================
// Sprint 112: Grading Fairness Types
// Deterministic fairness evaluation. No AI calls.
// ============================================

/** Fairness decision */
export type FairnessDecision = 'correct' | 'accept' | 'partially_correct' | 'incorrect';

/** Fairness score dimensions */
export interface FairnessDimensions {
  semanticFairness: number;  // How close is meaning to reference?
  languageFairness: number;  // British/American, abbreviations handled?
  spellingFairness: number;  // Spelling tolerance applied?
  grammarFairness: number;   // Tense, articles, singular/plural handled?
  keywordCoverage: number;   // Weighted keyword match?
  overall: number;
}

export const FAIRNESS_WEIGHTS: Record<keyof Omit<FairnessDimensions, 'overall'>, number> = {
  semanticFairness: 0.30,
  languageFairness: 0.15,
  spellingFairness: 0.15,
  grammarFairness: 0.15,
  keywordCoverage: 0.25,
};

/** A single fairness rule check */
export interface FairnessCheck {
  ruleId: string;
  passed: boolean;
  score: number; // 0-1
  detail?: string;
  originalValue?: string;
  normalizedValue?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/** Fairness evaluation input */
export interface FairnessInput {
  studentAnswer: string;
  referenceAnswer: string;
  /** Optional accepted alternative answers */
  acceptedAnswers?: string[];
  /** Weighted keywords for keyword-based grading */
  keywords?: WeightedKeyword[];
  /** Maximum allowed spelling edit distance */
  maxSpellingDistance?: number;
  /** Question type for context */
  questionType?: string;
}

/** Weighted keyword */
export interface WeightedKeyword {
  word: string;
  weight: number;     // 0-1
  category: 'core' | 'supporting' | 'optional';
  /** Acceptable variations */
  variations?: string[];
}

/** Full fairness result */
export interface FairnessResult {
  decision: FairnessDecision;
  dimensions: FairnessDimensions;
  score: number; // 0-100
  confidence: number; // 0-1
  checks: FairnessCheck[];
  /** Awarded partial credit (0-1) if applicable */
  partialCredit: number;
  /** Normalized student answer after all transformations */
  normalizedAnswer: string;
  /** Normalized reference answer */
  normalizedReference: string;
  /** Which rules contributed most */
  topContributors: string[];
  warnings: string[];
  metadata: {
    totalChecks: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
}

/** Interface for fairness rules */
export interface FairnessRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  /** Evaluate fairness. Returns modified input + check. */
  evaluate(input: FairnessInput, context: FairnessContext): {
    input: FairnessInput;
    check: FairnessCheck;
  };
}

/** Context passed between fairness rules */
export interface FairnessContext {
  /** Accumulated score adjustments */
  scoreAdjustments: number;
  /** Applied normalizations so far */
  appliedRules: string[];
  /** Running confidence */
  confidence: number;
}

export const DEFAULT_FAIRNESS_CONTEXT: FairnessContext = {
  scoreAdjustments: 0,
  appliedRules: [],
  confidence: 1.0,
};

/** Calculate fairness score from dimensions */
export function calculateFairnessScore(
  dims: Omit<FairnessDimensions, 'overall'>,
): FairnessDimensions {
  const overall = Math.round(
    dims.semanticFairness * FAIRNESS_WEIGHTS.semanticFairness +
    dims.languageFairness * FAIRNESS_WEIGHTS.languageFairness +
    dims.spellingFairness * FAIRNESS_WEIGHTS.spellingFairness +
    dims.grammarFairness * FAIRNESS_WEIGHTS.grammarFairness +
    dims.keywordCoverage * FAIRNESS_WEIGHTS.keywordCoverage,
  );
  return { ...dims, overall: Math.max(0, Math.min(100, overall)) };
}

/** Determine decision from score */
export function determineFairnessDecision(score: number): FairnessDecision {
  if (score >= 95) return 'correct';
  if (score >= 80) return 'accept';
  if (score >= 60) return 'partially_correct';
  return 'incorrect';
}

/** Compute partial credit from score */
export function computePartialCredit(score: number): number {
  if (score >= 95) return 1.0;
  if (score >= 80) return 0.90;
  if (score >= 70) return 0.80;
  if (score >= 60) return 0.70;
  return 0.50;
}

/** Create default dimensions */
export function createFairnessDimensions(): Omit<FairnessDimensions, 'overall'> {
  return {
    semanticFairness: 100, languageFairness: 100, spellingFairness: 100,
    grammarFairness: 100, keywordCoverage: 100,
  };
}
