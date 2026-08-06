// @deprecated Sprint 111: Not needed for single-school. Fix prompts instead of post-processing.
// ============================================
// Sprint 111: Output Calibration — Barrel Export
// ============================================

// Types
export type {
  CalibrationDecision, CalibrationDimensions, CalibrationCheck,
  CalibrationResult, CalibrationRule,
} from './calibration-types';
export {
  calculateCalibrationScore, determineCalibrationDecision,
  createCalibrationDimensions, CALIBRATION_WEIGHTS,
} from './calibration-types';

// Engine
export { calibrate } from './calibration-engine';

// Registry
export {
  registerRule, getRule, getAllRules, getRulesByPriority,
  initCalibrationRegistry, clearRegistry, getRuleCount, hasRule,
} from './calibration-registry';

// Rules
export {
  answerLengthRule, explanationQualityRule, mcqDistributionRule,
  optionLengthRule, placeholderRemovalRule, naturalLanguageRule,
  readingSupportRule, listeningSupportRule, writingPromptCompletenessRule,
  grammarExampleRule, vocabularyNaturalnessRule, allCalibrationRules,
} from './rules/calibration-rules';

// Metrics
export {
  recordCalibration, recordRuleExecution, getCalibrationMetrics,
  resetCalibrationMetrics,
} from './calibration-metrics';

// Report
export {
  generateCalibrationReport, formatCalibrationReport,
  formatCalibrationReportJson, type CalibrationReport,
} from './calibration-report';
