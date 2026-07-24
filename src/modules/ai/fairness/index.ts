// ============================================
// Sprint 112: Grading Fairness — Barrel Export
// ============================================

export type {
  FairnessDecision, FairnessDimensions, FairnessCheck,
  FairnessInput, FairnessResult, FairnessRule, FairnessContext, WeightedKeyword,
} from './fairness-types';
export {
  calculateFairnessScore, determineFairnessDecision, computePartialCredit,
  createFairnessDimensions, FAIRNESS_WEIGHTS, DEFAULT_FAIRNESS_CONTEXT,
} from './fairness-types';

export { evaluateFairness } from './fairness-engine';

export {
  registerRule, getRule, getAllRules, getRulesByPriority,
  initFairnessRegistry, clearRegistry, getRuleCount,
} from './fairness-registry';

export {
  articleToleranceRule, punctuationToleranceRule, caseToleranceRule,
  whitespaceToleranceRule, britishAmericanRule, spellingToleranceRule,
  verbTenseToleranceRule, singularPluralRule, abbreviationRule,
  numberNormalizationRule, synonymExpansionRule, keywordCoverageRule,
  semanticConfidenceRule, partialCreditRule, allFairnessRules,
} from './rules/fairness-rules';

export {
  recordFairnessEvaluation, recordRuleExecution,
  getFairnessMetrics, resetFairnessMetrics,
} from './fairness-metrics';

export {
  generateFairnessReport, formatFairnessReport,
  formatFairnessReportJson, type FairnessReport,
} from './fairness-report';
