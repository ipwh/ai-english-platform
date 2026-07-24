// ============================================
// Sprint 104: Repair Budget
// Prevents infinite repair loops. Caps patches and regenerations.
// ============================================

export interface RepairBudget {
  /** Maximum patch operations allowed per execution */
  maxPatches: number;
  /** Maximum regeneration operations allowed per execution */
  maxRegenerations: number;
  /** Maximum total repair time in milliseconds */
  maxRepairTimeMs: number;
  /** Maximum total repair attempts (patches + regenerations) */
  maxTotalAttempts: number;
  /** Current patch count */
  patchCount: number;
  /** Current regeneration count */
  regenerationCount: number;
  /** Repair start time */
  startTime: number;
  /** Whether the budget has been exceeded */
  exceeded: boolean;
  /** Reason for exceeding */
  exceedReason?: string;
}

const DEFAULT_MAX_PATCHES = 2;
const DEFAULT_MAX_REGENERATIONS = 1;
const DEFAULT_MAX_REPAIR_TIME_MS = 15000;
const DEFAULT_MAX_TOTAL_ATTEMPTS = 3;

/** Create a new repair budget with default limits. */
export function createRepairBudget(overrides?: Partial<Pick<RepairBudget, 'maxPatches' | 'maxRegenerations' | 'maxRepairTimeMs' | 'maxTotalAttempts'>>): RepairBudget {
  return {
    maxPatches: overrides?.maxPatches ?? DEFAULT_MAX_PATCHES,
    maxRegenerations: overrides?.maxRegenerations ?? DEFAULT_MAX_REGENERATIONS,
    maxRepairTimeMs: overrides?.maxRepairTimeMs ?? DEFAULT_MAX_REPAIR_TIME_MS,
    maxTotalAttempts: overrides?.maxTotalAttempts ?? DEFAULT_MAX_TOTAL_ATTEMPTS,
    patchCount: 0,
    regenerationCount: 0,
    startTime: Date.now(),
    exceeded: false,
  };
}

/** Check if a patch operation is within budget. */
export function canPatch(budget: RepairBudget): boolean {
  if (budget.exceeded) return false;
  if (budget.patchCount >= budget.maxPatches) return false;
  if (budget.patchCount + budget.regenerationCount >= budget.maxTotalAttempts) return false;
  if (Date.now() - budget.startTime > budget.maxRepairTimeMs) return false;
  return true;
}

/** Check if a regeneration operation is within budget. */
export function canRegenerate(budget: RepairBudget): boolean {
  if (budget.exceeded) return false;
  if (budget.regenerationCount >= budget.maxRegenerations) return false;
  if (budget.patchCount + budget.regenerationCount >= budget.maxTotalAttempts) return false;
  if (Date.now() - budget.startTime > budget.maxRepairTimeMs) return false;
  return true;
}

/** Record a patch operation against the budget. */
export function recordPatch(budget: RepairBudget): void {
  budget.patchCount++;
  checkExceeded(budget);
}

/** Record a regeneration operation against the budget. */
export function recordRegeneration(budget: RepairBudget): void {
  budget.regenerationCount++;
  checkExceeded(budget);
}

function checkExceeded(budget: RepairBudget): void {
  if (Date.now() - budget.startTime > budget.maxRepairTimeMs) {
    budget.exceeded = true;
    budget.exceedReason = 'Repair time exceeded maximum';
  }
  if (budget.patchCount + budget.regenerationCount >= budget.maxTotalAttempts) {
    budget.exceeded = true;
    budget.exceedReason = 'Maximum total repair attempts reached';
  }
}

/** Get budget usage summary. */
export function getBudgetUsage(budget: RepairBudget) {
  return {
    patchCount: budget.patchCount,
    regenerationCount: budget.regenerationCount,
    totalAttempts: budget.patchCount + budget.regenerationCount,
    elapsedMs: Date.now() - budget.startTime,
    patchBudgetRemaining: Math.max(0, budget.maxPatches - budget.patchCount),
    regenerationBudgetRemaining: Math.max(0, budget.maxRegenerations - budget.regenerationCount),
    timeBudgetRemaining: Math.max(0, budget.maxRepairTimeMs - (Date.now() - budget.startTime)),
    exceeded: budget.exceeded,
    exceedReason: budget.exceedReason,
  };
}
