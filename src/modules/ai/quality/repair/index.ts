// ============================================
// Sprint 104: Self-Healing Repair Layer — Barrel Export
// ============================================

// Types & Enums
export { RepairAction, RepairCost, REPAIR_ACTION_COST, REPAIR_PRIORITY_ORDER, isDeterministicRepair } from './repair-action';
export { RepairPlan, type RepairStep } from './repair-plan';
export type { RepairBudget } from './repair-budget';
export { createRepairBudget, canPatch, canRegenerate, recordPatch, recordRegeneration, getBudgetUsage } from './repair-budget';

// Engine
export { repairPlanner } from './repair-planner';
export { repairPipeline, type RepairPipelineResult } from './repair-pipeline';

// Strategy
export { DEFAULT_REPAIR_STRATEGY, getRepairAction, getRuleTarget, resolveRepairAction } from './repair-strategy';

// Metrics
export {
  recordRepairAttempt,
  recordRepairSuccess,
  recordRepairFailure,
  recordBudgetExceeded,
  getRepairMetrics,
  resetRepairMetrics,
} from './repair-metrics';

// History
export {
  logRepairHistory,
  getRepairHistory,
  getRepairHistoryForRule,
  getRecentFailures,
  clearRepairHistory,
  type RepairHistoryEntry,
} from './repair-history';

// Report
export {
  generateRepairReport,
  formatRepairSummary,
  type RepairReport,
} from './repair-report';
