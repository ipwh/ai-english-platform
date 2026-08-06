// ============================================
// Sprint 105: Evaluation Types
// Core types for the Intelligent Answer Evaluation Layer.
// ============================================

/** Grading strictness policy */
export type GradingPolicy = 'strict' | 'standard' | 'lenient' | 'custom';

/** Final grading decision */
export type GradingDecision = 'correct' | 'partially_correct' | 'incorrect';

/** Configuration for a grading policy */
export interface GradingPolicyConfig {
  /** Minimum semantic score (0-1) to be considered correct */
  minSemanticScore: number;
  /** Minimum keyword coverage ratio (0-1) */
  minKeywordCoverage: number;
  /** Maximum allowed Levenshtein distance per character */
  maxSpellingDistance: number;
  /** Whether to ignore tense variations */
  allowTenseVariation: boolean;
  /** Whether to ignore article errors (a/an/the) */
  allowArticleErrors: boolean;
  /** Whether to ignore singular/plural when meaning unchanged */
  allowNumberVariation: boolean;
  /** Whether to ignore punctuation */
  ignorePunctuation: boolean;
  /** Whether to normalize British/American spelling */
  normalizeSpelling: boolean;
}

/** Pre-defined grading policies */
export const GRADING_POLICIES: Record<GradingPolicy, GradingPolicyConfig> = {
  strict: {
    minSemanticScore: 0.95,
    minKeywordCoverage: 1.0,
    maxSpellingDistance: 0.0,
    allowTenseVariation: false,
    allowArticleErrors: false,
    allowNumberVariation: false,
    ignorePunctuation: false,
    normalizeSpelling: false,
  },
  standard: {
    minSemanticScore: 0.70,
    minKeywordCoverage: 0.60,
    maxSpellingDistance: 0.15,
    allowTenseVariation: true,
    allowArticleErrors: true,
    allowNumberVariation: true,
    ignorePunctuation: true,
    normalizeSpelling: true,
  },
  lenient: {
    minSemanticScore: 0.40,
    minKeywordCoverage: 0.30,
    maxSpellingDistance: 0.30,
    allowTenseVariation: true,
    allowArticleErrors: true,
    allowNumberVariation: true,
    ignorePunctuation: true,
    normalizeSpelling: true,
  },
  custom: {
    minSemanticScore: 0.70,
    minKeywordCoverage: 0.60,
    maxSpellingDistance: 0.15,
    allowTenseVariation: true,
    allowArticleErrors: true,
    allowNumberVariation: true,
    ignorePunctuation: true,
    normalizeSpelling: true,
  },
};

/** A single keyword with optional weight */
export interface GradingKeyword {
  word: string;
  weight: number; // 0-1, default 1
  required: boolean;
}

/** Full evaluation input */
export interface EvaluationInput {
  studentAnswer: string;
  referenceAnswer: string;
  /** Optional: list of acceptable alternative answers */
  acceptedAnswers?: string[];
  /** Optional: keywords that must appear (for keyword-based grading) */
  keywords?: string[];
  /** Optional: weighted keywords */
  weightedKeywords?: GradingKeyword[];
  /** Grading policy to use */
  policy?: GradingPolicy;
  /** Custom policy overrides */
  policyOverrides?: Partial<GradingPolicyConfig>;
  /** Question type for context-aware grading */
  questionType?: string;
}

/** Full evaluation output */
export interface EvaluationOutput {
  studentAnswer: string;
  referenceAnswer: string;
  normalizedStudent: string;
  normalizedReference: string;
  exactMatch: boolean;
  caseInsensitiveMatch: boolean;
  keywordScore: number;
  semanticScore: number;
  grammarScore: number;
  overallScore: number;
  decision: GradingDecision;
  policy: GradingPolicy;
  matchedKeywords: string[];
  missingKeywords: string[];
  triggeredRules: string[];
  details: Record<string, unknown>;
  /** Whether embedding-based similarity was used to boost the score */
  embeddingUsed?: boolean;
  /** The raw embedding similarity score (0-1), if used */
  embeddingScore?: number;
}

/** Result of a single evaluation rule */
export interface RuleEvaluationResult {
  ruleName: string;
  passed: boolean;
  score: number; // 0-1 contribution
  detail?: string;
}

/** Interface for evaluation rules */
export interface EvaluationRule {
  readonly name: string;
  readonly description: string;
  /** Evaluate student answer against reference. Returns score 0-1. */
  evaluate(studentAnswer: string, referenceAnswer: string, config: GradingPolicyConfig): RuleEvaluationResult;
}
