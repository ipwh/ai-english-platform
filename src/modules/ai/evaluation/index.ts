// ============================================
// Sprint 105: Intelligent Answer Evaluation — Barrel Export
// ============================================

// Types
export type {
  GradingPolicy,
  GradingDecision,
  GradingPolicyConfig,
  EvaluationInput,
  EvaluationOutput,
  EvaluationRule,
  RuleEvaluationResult,
  GradingKeyword,
} from './evaluation-types';
export { GRADING_POLICIES } from './evaluation-types';

// Engine
export { evaluationEngine } from './evaluation-engine';

// Normalizer
export { normalizeAnswer, BRITISH_TO_AMERICAN, COMMON_ABBREVIATIONS } from './answer-normalizer';

// Semantic
export { computeSemanticScore, computeKeywordScore } from './semantic-comparator';

// Synonyms
export { areSynonyms, getSynonyms, matchesAcceptedAnswer, SYNONYM_GROUPS } from './accepted-answer';

// Registry
export { gradingRegistry } from './grading-registry';

// Rules
export {
  exactMatchRule, caseInsensitiveRule,
  punctuationRule, whitespaceRule, articleRule, pluralRule, tenseRule, spellingRule,
  synonymRule, semanticRule, keywordRule,
} from './rules';

// Metrics
export {
  recordEvaluation, recordGrading, recordRuleUsage,
  recordSemanticScore, recordKeywordScore,
  getEvaluationMetrics, resetEvaluationMetrics,
} from './evaluation-metrics';

// Result
export { quickEvaluate, formatEvaluationResult } from './evaluation-result';

// Report
export { generateEvaluationReport, type EvaluationReport } from './evaluation-report';
