// Sprint 84: Budget Policy — token and cost budget tracking
// No external billing integration. Estimates only.

export interface BudgetPolicy {
  /** Daily token budget */
  dailyTokenLimit: number;
  /** Monthly cost budget (USD) */
  monthlyCostLimit: number;
  /** Per-provider daily token budgets */
  providerLimits: Record<string, number>;
}

export interface BudgetStatus {
  tokensUsedToday: number;
  tokensRemaining: number;
  costEstimateToday: number;
  costRemaining: number;
  exceeded: boolean;
}

const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  dailyTokenLimit: 500000,
  monthlyCostLimit: 50,
  providerLimits: {},
};

let budgetPolicy: BudgetPolicy = { ...DEFAULT_BUDGET_POLICY };
let tokensUsedToday = 0;
let costEstimateToday = 0;

export function getBudgetPolicy(): BudgetPolicy {
  return { ...budgetPolicy };
}

export function setBudgetPolicy(policy: Partial<BudgetPolicy>): void {
  budgetPolicy = { ...budgetPolicy, ...policy };
}

export function recordTokenUsage(tokens: number, estimatedCostUsd = 0): void {
  tokensUsedToday += tokens;
  costEstimateToday += estimatedCostUsd;
}

export function getBudgetStatus(): BudgetStatus {
  const tokensRemaining = Math.max(0, budgetPolicy.dailyTokenLimit - tokensUsedToday);
  const costRemaining = Math.max(0, budgetPolicy.monthlyCostLimit - costEstimateToday);
  return {
    tokensUsedToday,
    tokensRemaining,
    costEstimateToday: Math.round(costEstimateToday * 10000) / 10000,
    costRemaining: Math.round(costRemaining * 100) / 100,
    exceeded: tokensRemaining <= 0 || costRemaining <= 0,
  };
}

export function isBudgetExceeded(): boolean {
  return getBudgetStatus().exceeded;
}

export function resetBudgetTracking(): void {
  tokensUsedToday = 0;
  costEstimateToday = 0;
}
