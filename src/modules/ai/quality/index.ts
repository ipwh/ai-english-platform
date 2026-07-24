// ============================================
// Sprint 101: AI Quality Layer — Barrel Export
// Canonical entry point: import from '@/modules/ai/quality'
// ============================================

// Types
export type {
  QualityRule,
  QualityResult,
  QualityContext,
  QualityMetrics,
  QualityDimensions,
  SeverityBreakdown,
  QualitySeverity,
  RuleCategory,
  RuleCheckResult,
  RuleFailure,
  RepairResult,
  RepairRecord,
  RulePriority,
} from './quality-types';
export { calculateQualityScore, calculateDimensionScore, createQualityDimensions, PRIORITY_TO_SEVERITY, DEFAULT_DIMENSION_WEIGHTS } from './quality-types';

// Base class
export { BaseQualityRule } from './quality-rule';

// Engine
export { qualityEngine } from './quality-engine';

// Registry
export { qualityRegistry } from './quality-registry';

// Repairs
export {
  repairMissingAnswer,
  repairMissingExplanation,
  repairDuplicateOptions,
  repairMcqAnswerLetter,
  repairWhitespace,
  repairChoiceNormalization,
  applyAllRepairs,
} from './repair-engine';

// Metrics
export {
  recordQualityExecution,
  recordQualityExecutionForType,
  recordRuleExecution,
  getQualityMetrics,
  getRuleStatistics,
  getTopFailingRules,
  getRuleHealth,
  resetQualityMetrics,
} from './quality-metrics';

// Report
export {
  generateQualityReport,
  formatQualitySummary,
  type QualityReport,
} from './quality-report';

// Rule Packs
export {
  QuestionQualityRulePack,
  questionQualityRulePack,
} from './rules';

export {
  ContentConsistencyRulePack,
  contentConsistencyRulePack,
} from './rules/content';

// Sprint 104: Self-Healing Repair Layer
export {
  RepairAction,
  RepairCost,
  RepairPlan,
  repairPlanner,
  repairPipeline,
  createRepairBudget,
  getBudgetUsage,
  recordRepairAttempt,
  recordRepairSuccess,
  recordRepairFailure,
  getRepairMetrics,
  resetRepairMetrics,
  logRepairHistory,
  getRepairHistory,
  generateRepairReport,
  formatRepairSummary,
  isDeterministicRepair,
  type RepairStep,
  type RepairBudget,
  type RepairPipelineResult,
  type RepairReport,
  type RepairHistoryEntry,
} from './repair';
