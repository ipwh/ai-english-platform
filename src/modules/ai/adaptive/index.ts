// ============================================
// Sprint 114: Adaptive Learning — Barrel Export
// ============================================

export type {
  SkillDomain, DifficultyLevel, AdaptiveDecision, RecommendationType,
  SkillScore, PerformanceRecord, StudentProfile, AdaptiveConfig,
  AdaptiveDimensions, AdaptiveCheck, AdaptiveResult, AdaptiveRule, AdaptiveContext,
} from './adaptive-types';
export {
  calculateAdaptiveScore, determineAdaptiveDecision, createAdaptiveDimensions,
  ADAPTIVE_WEIGHTS, DEFAULT_ADAPTIVE_CONFIG, ALL_SKILLS, DIFFICULTY_ORDER,
} from './adaptive-types';

export { evaluateAdaptiveLearning } from './adaptive-engine';

export {
  registerRule, getRule, getAllRules, getRulesByPriority,
  initAdaptiveRegistry, clearRegistry, getRuleCount,
} from './adaptive-registry';

export {
  createStudentProfile, updateProfileAfterAnswer,
  getWeakestSkills, getStrongestSkills, getSkillScore, isSessionFatigued,
} from './adaptive-profile';

export {
  recordPerformance, getPerformanceHistory, getRecentRecords,
  getRecordsByDomain, getRecentAccuracy, getIncorrectByDomain,
  getIncorrectVocabulary, getIncorrectGrammar, clearHistory, getHistorySize,
} from './adaptive-history';

export {
  difficultyAdjustmentRule, weakSkillFocusRule, masteryProgressionRule,
  repeatedMistakeRule, vocabularyRecyclingRule, grammarRecyclingRule,
  questionVarietyAdaptationRule, confidenceAdjustmentRule, challengeBalanceRule,
  sessionFatigueRule, learningObjectiveRule, adaptiveRecommendationRule,
  allAdaptiveRules,
} from './rules/adaptive-rules';

export {
  recordAdaptiveEvaluation, recordRuleExecution,
  getAdaptiveMetrics, resetAdaptiveMetrics,
} from './adaptive-metrics';

export {
  generateAdaptiveReport, formatAdaptiveReport,
  formatAdaptiveReportJson, type AdaptiveReport,
} from './adaptive-report';
