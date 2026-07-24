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
  RuleCheckResult,
  RuleFailure,
  RepairResult,
  RepairRecord,
  RulePriority,
} from './quality-types';
export { calculateQualityScore } from './quality-types';

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
  getQualityMetrics,
  resetQualityMetrics,
} from './quality-metrics';

// Report
export {
  generateQualityReport,
  formatQualitySummary,
  type QualityReport,
} from './quality-report';
