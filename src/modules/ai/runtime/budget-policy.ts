// Sprint 84: Budget Policy — token and cost budget tracking
// No external billing integration. Estimates only.
//
// 2026-09-18: the counters moved out of this module into `AiUsageStore` so the
// daily budget is durable and shared by every Cloud Run instance. Before that,
// the limit was evaluated against per-process state: one warm instance could
// answer 503 for the rest of the day while its siblings were still fresh, and
// every cold start reset the cap. Limits are now configurable
// (`AI_DAILY_TOKEN_LIMIT` / `AI_MONTHLY_COST_LIMIT`).

import { config } from '@/shared/config/config';
import { getAiUsageStore, setAiUsageStore, MemoryAiUsageStore } from './ai-usage-store';

export interface BudgetPolicy {
  /** Daily token budget */
  dailyTokenLimit: number;
  /** Monthly cost budget (USD) */
  monthlyCostLimit: number;
  /** Per-provider daily token budgets */
  providerLimits: Record<string, number>;
}

export interface BudgetStatus {
  /** Estimated tokens consumed so far today (UTC day), across all instances */
  tokensUsedToday: number;
  /** Remaining tokens for today (against `dailyTokenLimit`) */
  tokensRemaining: number;
  /** Estimated USD spent today (UTC day) */
  costEstimateToday: number;
  /** Remaining USD for this UTC month (against `monthlyCostLimit`) */
  costRemaining: number;
  exceeded: boolean;
}

/** Limits come from config (`AI_DAILY_TOKEN_LIMIT` / `AI_MONTHLY_COST_LIMIT`). */
export function defaultBudgetPolicy(): BudgetPolicy {
  return {
    dailyTokenLimit: config.ai.dailyTokenLimit,
    monthlyCostLimit: config.ai.monthlyCostLimit,
    providerLimits: {},
  };
}

/**
 * Rough blended cost estimate used ONLY for budget accounting (never billing).
 * $1 per 1M tokens is a conservative blended rate across the fallback chain
 * (DeepSeek ~$0.28/1M input, Gemini Flash cheap, Grok more expensive).
 */
export const ESTIMATED_USD_PER_TOKEN = 1 / 1_000_000;

let budgetPolicy: BudgetPolicy = defaultBudgetPolicy();

/** UTC calendar day key (YYYY-MM-DD) — the token budget resets at midnight UTC. */
function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC calendar month key (YYYY-MM) — the cost budget resets at the month boundary. */
function getUtcMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function getBudgetPolicy(): BudgetPolicy {
  return { ...budgetPolicy };
}

export function setBudgetPolicy(policy: Partial<BudgetPolicy>): void {
  budgetPolicy = { ...budgetPolicy, ...policy };
}

/**
 * Record tokens consumed (and their estimated cost) against the current UTC day.
 *
 * Writes to the shared ledger, so the daily budget counts every instance rather
 * than only the process that served the request.
 */
export async function recordTokenUsage(tokens: number, estimatedCostUsd = 0): Promise<void> {
  await getAiUsageStore().addUsage(getUtcDayKey(new Date()), tokens, estimatedCostUsd);
}

/**
 * Current budget status.
 *
 * Token usage is scoped to the UTC day; cost is scoped to the UTC month, so a
 * day rollover no longer wipes the monthly cost total.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const now = new Date();
  const store = getAiUsageStore();
  const [day, monthCostUsd] = await Promise.all([
    store.readDay(getUtcDayKey(now)),
    store.readMonthCost(getUtcMonthKey(now)),
  ]);

  const tokensRemaining = Math.max(0, budgetPolicy.dailyTokenLimit - day.tokens);
  const costRemaining = Math.max(0, budgetPolicy.monthlyCostLimit - monthCostUsd);

  return {
    tokensUsedToday: day.tokens,
    tokensRemaining,
    costEstimateToday: Math.round(day.costUsd * 10000) / 10000,
    costRemaining: Math.round(costRemaining * 100) / 100,
    exceeded: tokensRemaining <= 0 || costRemaining <= 0,
  };
}

export async function isBudgetExceeded(): Promise<boolean> {
  return (await getBudgetStatus()).exceeded;
}

/**
 * Restore the default policy and empty the in-memory ledger.
 *
 * Test helper: it never deletes durable rows, so it is safe to call anywhere —
 * in production it only re-resolves the store.
 */
export function resetBudgetTracking(): void {
  budgetPolicy = defaultBudgetPolicy();
  setAiUsageStore(null);
  const store = getAiUsageStore();
  if (store instanceof MemoryAiUsageStore) store.clear();
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
