// ============================================
// Sprint 108: Optimization Layer — Barrel Export
// ============================================

export type { OptimizationDecision, OptimizationDimensions, OptimizationCheck, OptimizationResult, OptimizationRule } from './optimization-types';
export { calculateOptimizationScore, determineOptimizationDecision, OPTIMIZATION_WEIGHTS } from './optimization-types';

export { optimizationEngine } from './optimization-engine';
export { optimizationRegistry } from './optimization-registry';

export {
  studentToleranceRule, answerQualityRule, distractorRule,
  mcqBalanceRule, explanationRule, difficultyRebalanceRule,
  optionNaturalnessRule, wordingRule, duplicateChoiceRule,
  readabilityRule, writingPromptRule, vocabularySmoothingRule,
} from './rules';

export { recordOptimization, recordRuleExecution, getOptimizationMetrics, resetOptimizationMetrics } from './optimization-metrics';
