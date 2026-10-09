// ============================================
// Prompt Regression Evaluation — Core Types
//
// Isolated evaluation module. Never imported by production code.
// All types describe evaluation fixtures, scoring, and reporting.
// ============================================

import type { ChatMessage } from '@/modules/ai/providers';

// ── Fixture ──

/** A single evaluation test case */
export interface EvalFixture {
  /** Unique identifier, e.g. "reading-001" */
  id: string;
  /** Human-readable description of what this fixture tests */
  description: string;
  /** Which prompt builder to invoke (matches ExecutionContext.promptName) */
  promptName: string;
  /** Feature area for ExecutionContext */
  feature: string;
  /** Use case for ExecutionContext */
  useCase: string;
  /** Messages to send to the AI provider */
  messages: ChatMessage[];
  /** LLM call options (temperature, maxTokens, jsonMode, etc.) */
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    timeoutMs?: number;
  };
  /** Zod schema name for response validation (references shared/schemas) */
  schemaName?: string;
  /** Expected quality characteristics — NOT expected output */
  expectedCharacteristics: ExpectedCharacteristics;
}

/** Quality characteristics that a good response should exhibit */
export interface ExpectedCharacteristics {
  /** Expected HKDSE difficulty level */
  difficulty?: string;
  /** Expected number of questions generated */
  questionCount?: number;
  /** Whether the response should contain inference-type questions */
  containsInference?: boolean;
  /** Whether the response should contain vocabulary questions */
  containsVocabulary?: boolean;
  /** Expected word count range for generated passages [min, max] */
  readingLengthRange?: [number, number];
  /** Expected number of paragraphs */
  paragraphCount?: number;
  /** Whether referencing questions should be present */
  containsReferencing?: boolean;
  /** Whether summary cloze should be present */
  containsSummaryCloze?: boolean;
  /** Minimum acceptable rubric score (0-100) */
  minRubricScore?: number;
  /** Minimum acceptable semantic similarity to golden (0-100) */
  minSemanticScore?: number;
  /** Expected skill distribution (e.g. { grammar: 3, vocabulary: 2, inference: 2 }) */
  skillDistribution?: Record<string, number>;
  /** Additional custom checks as key-value pairs */
  custom?: Record<string, unknown>;
}

// ── Scoring ──

/** Complete evaluation result for a single fixture */
export interface EvalResult {
  fixtureId: string;
  /** Whether this fixture passed all checks */
  passed: boolean;
  /** Individual dimension scores */
  scores: EvalScores;
  /** Generated output (the actual AI response) */
  output: unknown;
  /** Golden output for comparison (if available) */
  golden?: unknown;
  /** Provider that generated the response */
  provider: string;
  /** Total latency in milliseconds */
  latencyMs: number;
  /** Token usage estimate */
  tokensUsed?: number;
  /** Detailed failure reasons if not passed */
  failures: EvalFailure[];
  /** Timestamp of evaluation */
  evaluatedAt: string;
}

/** Dimension scores */
export interface EvalScores {
  rubric: RubricScore;
  semantic: SemanticScore;
  structural: StructuralScore;
  /** Weighted overall score (0-100) */
  overall: number;
}

/** Rubric-based quality dimensions */
export interface RubricScore {
  /** Raw score 0-100 */
  score: number;
  /** Weight: rubric contributes 40% to overall */
  weight: number;
  dimensions: {
    accuracy: number;           // 0-10: factual correctness
    coverage: number;           // 0-10: breadth of content
    difficultyMatch: number;    // 0-10: matches expected difficulty
    instructionFollowing: number; // 0-10: follows prompt instructions
    hallucination: number;      // 0-10: absence of fabricated content (higher = less hallucination)
    consistency: number;        // 0-10: internal consistency
    jsonValidity: number;       // 0-10: valid JSON structure
    schemaCompliance: number;   // 0-10: matches expected schema
  };
}

/** Semantic similarity to golden output */
export interface SemanticScore {
  /** Raw score 0-100 */
  score: number;
  /** Weight: semantic contributes 35% to overall */
  weight: number;
  dimensions: {
    semanticSimilarity: number;    // 0-10: overall semantic overlap
    coverageSimilarity: number;    // 0-10: topic/keyword coverage
    difficultySimilarity: number;  // 0-10: difficulty level match
    questionDiversity: number;     // 0-10: variety of question types
    topicAlignment: number;        // 0-10: topic alignment with golden
    duplicatePenalty: number;      // 0-10: penalty for duplicate questions (10 = no duplicates)
  };
}

/** Structural validation — binary pass/fail per check */
export interface StructuralScore {
  /** Raw score 0-100 */
  score: number;
  /** Weight: structural contributes 25% to overall */
  weight: number;
  checks: {
    jsonSchema: boolean;          // Valid JSON per schema
    questionCount: boolean;       // Correct number of questions
    difficulty: boolean;          // Difficulty matches expected
    paragraphDistribution: boolean; // Even paragraph coverage
    blueprintCompliance: boolean; // Matches question blueprint
    referenceIntegrity: boolean;  // Paragraph references are valid
    noEmptyFields: boolean;       // No null/undefined/empty fields
    validQuestionTypes: boolean;  // All question types are recognized
  };
}

/** A specific failure reason */
export interface EvalFailure {
  dimension: 'rubric' | 'semantic' | 'structural';
  check: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

// ── Report ──

/** Complete regression report for a full evaluation run */
export interface RegressionReport {
  /** Summary metadata */
  summary: {
    totalFixtures: number;
    passed: number;
    failed: number;
    overallScore: number;
    previousOverallScore?: number;
    scoreDelta?: number;
    provider: string;
    totalLatencyMs: number;
    totalTokensUsed: number;
    evaluatedAt: string;
  };
  /** Per-fixture results */
  results: EvalResult[];
  /** Worst regressions (top 5 score drops) */
  worstRegressions: EvalResult[];
  /** Added strengths (fixtures that improved) */
  addedStrengths: EvalResult[];
  /** Removed capabilities (fixtures that went from pass → fail) */
  removedCapabilities: EvalResult[];
}

// ── Regression Config ──

/** Configuration for regression pass/fail rules */
export interface RegressionConfig {
  /** Maximum allowed drop in overall score (percentage points) */
  maxOverallDrop: number;
  /** Maximum allowed drop in rubric score (raw points) */
  maxRubricDrop: number;
  /** Minimum acceptable semantic score */
  minSemanticScore: number;
  /** Whether structural failures are automatic failures */
  structuralFailIsHardFail: boolean;
}

/** Default regression thresholds */
export const DEFAULT_REGRESSION_CONFIG: RegressionConfig = {
  maxOverallDrop: 3,
  maxRubricDrop: 5,
  minSemanticScore: 90,
  structuralFailIsHardFail: true,
};

// ── Scoring Weights ──

/** Score dimension weights for overall calculation */
export const SCORE_WEIGHTS = {
  rubric: 0.40,
  semantic: 0.35,
  structural: 0.25,
} as const;

/**
 * Validate SCORE_WEIGHTS at module initialization time.
 * Ensures weights are finite, non-negative, and sum to 1.0.
 */
function assertValidScoreWeights(weights: Record<string, number>): void {
  const values = Object.values(weights);

  if (values.some(v => !Number.isFinite(v) || v < 0)) {
    throw new Error('SCORE_WEIGHTS must contain only finite non-negative values');
  }

  const total = values.reduce((sum, v) => sum + v, 0);

  if (Math.abs(total - 1) >= 1e-9) {
    throw new Error(`SCORE_WEIGHTS must sum to 1.0; received ${total}`);
  }
}

// Validate at module load — catches configuration errors immediately
assertValidScoreWeights(SCORE_WEIGHTS);
