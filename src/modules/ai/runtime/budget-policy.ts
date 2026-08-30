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

/**
 * Rough blended cost estimate used ONLY for budget accounting (never billing).
 * $1 per 1M tokens is a conservative blended rate across the fallback chain
 * (DeepSeek ~$0.28/1M input, Gemini Flash cheap, Grok more expensive).
 */
export const ESTIMATED_USD_PER_TOKEN = 1 / 1_000_000;

let budgetPolicy: BudgetPolicy = { ...DEFAULT_BUDGET_POLICY };
let dayKey: string | null = null;
let tokensUsedToday = 0;
let costEstimateToday = 0;

/** UTC calendar day key (YYYY-MM-DD) — budget resets at midnight UTC. */
function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Lazy day rollover: whenever the budget state is read or written, reset the
 * counters if the UTC calendar day has changed. This gives real "daily"
 * semantics — a warm instance is never permanently blocked by yesterday's
 * usage and the counter never silently accumulates across days.
 */
function rollOverIfNeeded(): void {
  const today = getUtcDayKey(new Date());
  if (dayKey !== today) {
    dayKey = today;
    tokensUsedToday = 0;
    costEstimateToday = 0;
  }
}

export function getBudgetPolicy(): BudgetPolicy {
  return { ...budgetPolicy };
}

export function setBudgetPolicy(policy: Partial<BudgetPolicy>): void {
  budgetPolicy = { ...budgetPolicy, ...policy };
}

export function recordTokenUsage(tokens: number, estimatedCostUsd = 0): void {
  rollOverIfNeeded();
  tokensUsedToday += tokens;
  costEstimateToday += estimatedCostUsd;
}

export function getBudgetStatus(): BudgetStatus {
  rollOverIfNeeded();
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
  dayKey = null;
  tokensUsedToday = 0;
  costEstimateToday = 0;
}

/**
 * Typed error for budget exhaustion. Route handlers must map this to a
 * service-unavailable (503) response — never a generic 500.
 */
export class BudgetExceededError extends Error {
  readonly reason: 'token' | 'cost';

  constructor(reason: 'token' | 'cost') {
    const message =
      reason === 'token'
        ? '今日 AI 額度已用完，請稍後再試 / Daily AI token budget exceeded. Please try again later.'
        : '本月 AI 費用額度已用完，請稍後再試 / Monthly AI cost budget exceeded. Please try again later.';
    super(message);
    this.name = 'BudgetExceededError';
    this.reason = reason;
  }
}

/** Type guard for route handlers to return 503 for budget exhaustion. */
export function isBudgetExceededError(err: unknown): err is BudgetExceededError {
  return err instanceof BudgetExceededError;
}
