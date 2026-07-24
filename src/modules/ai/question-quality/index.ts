// ============================================
// Sprint 113: Question Quality — Barrel Export
// ============================================

export type {
  QualityDecision, QualityDimensions, QualityCheck,
  QuestionQualityResult, QuestionQualityRule, QualityContext,
} from './question-quality-types';
export {
  calculateQualityScore, determineQualityDecision,
  createQualityDimensions, QUALITY_WEIGHTS,
} from './question-quality-types';

export { evaluateQuestionQuality } from './question-quality-engine';

export {
  registerRule, getRule, getAllRules, getRulesByPriority,
  initQuestionQualityRegistry, clearRegistry, getRuleCount,
} from './question-quality-registry';

export {
  distractorPlausibilityRule, correctAnswerUniquenessRule, optionSimilarityRule,
  difficultyBalanceRule, questionClarityRule, stemCompletenessRule,
  readingEvidenceRule, listeningEvidenceRule, writingPromptQualityRule,
  integratedSkillsAlignmentRule, vocabularyLevelRule, grammarComplexityRule,
  questionVarietyRule, answerDistributionRule, allQuestionQualityRules,
} from './rules/question-quality-rules';

export {
  recordQualityEvaluation, recordRuleExecution,
  getQuestionQualityMetrics, resetQuestionQualityMetrics,
} from './question-quality-metrics';

export {
  generateQuestionQualityReport, formatQuestionQualityReport,
  formatQuestionQualityReportJson, type QuestionQualityReport,
} from './question-quality-report';
