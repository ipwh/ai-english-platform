// ============================================
// AI-001 budget policy tests — shared durable ledger, real UTC-day rollover
// semantics, month-scoped cost budget, boundary behavior, and the typed
// exhaustion error.
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BudgetExceededError,
  ESTIMATED_USD_PER_TOKEN,
  defaultBudgetPolicy,
  getBudgetPolicy,
  getBudgetStatus,
  isBudgetExceeded,
  isBudgetExceededError,
  recordTokenUsage,
  resetBudgetTracking,
  setBudgetPolicy,
} from '../budget-policy';
import { MemoryAiUsageStore, setAiUsageStore } from '../ai-usage-store';
import { config } from '@/shared/config/config';

/** Limits chosen by these tests — deliberately not the configured defaults. */
const TEST_DAILY_TOKENS = 500_000;
const TEST_MONTHLY_COST = 50;

let ledger: MemoryAiUsageStore;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-19T12:00:00Z'));
  resetBudgetTracking();
  ledger = new MemoryAiUsageStore();
  setAiUsageStore(ledger);
  setBudgetPolicy({ dailyTokenLimit: TEST_DAILY_TOKENS, monthlyCostLimit: TEST_MONTHLY_COST });
});

afterEach(() => {
  vi.useRealTimers();
  resetBudgetTracking();
});

describe('policy wiring', () => {
  it('limits come from config, so an operator can change them without a deploy', () => {
    expect(defaultBudgetPolicy().dailyTokenLimit).toBe(config.ai.dailyTokenLimit);
    expect(defaultBudgetPolicy().monthlyCostLimit).toBe(config.ai.monthlyCostLimit);
  });

  it('default daily limit leaves real headroom for a school day', () => {
    // Regression guard for 2026-09-17: the 500k literal blocked every AI call
    // for the rest of the day — one warm instance burned 24,672 tokens in the
    // first 13 minutes of its life.
    if (process.env.AI_DAILY_TOKEN_LIMIT) return; // operator override — not ours to police
    expect(defaultBudgetPolicy().dailyTokenLimit).toBeGreaterThanOrEqual(5_000_000);
  });
});

describe('daily token budget', () => {
  it('allows usage under the limit', async () => {
    await recordTokenUsage(1000);
    expect(await isBudgetExceeded()).toBe(false);
    expect((await getBudgetStatus()).tokensUsedToday).toBe(1000);
  });

  it('exact boundary blocks new calls; one token under does not', async () => {
    await recordTokenUsage(TEST_DAILY_TOKENS - 1);
    expect(await isBudgetExceeded()).toBe(false);
    await recordTokenUsage(1);
    expect(await isBudgetExceeded()).toBe(true);
    expect((await getBudgetStatus()).tokensRemaining).toBe(0);
  });

  it('resets naturally at the next UTC day boundary', async () => {
    await recordTokenUsage(TEST_DAILY_TOKENS);
    expect(await isBudgetExceeded()).toBe(true);

    // Advance to 00:00:30 UTC of the next day.
    vi.setSystemTime(new Date('2026-08-20T00:00:30Z'));

    const status = await getBudgetStatus();
    expect(status.tokensUsedToday).toBe(0);
    expect(status.exceeded).toBe(false);
    expect(await isBudgetExceeded()).toBe(false);
  });

  it('does not reset within the same UTC day', async () => {
    await recordTokenUsage(100);
    vi.setSystemTime(new Date('2026-08-19T23:59:59Z'));
    expect((await getBudgetStatus()).tokensUsedToday).toBe(100);
  });

  it('accumulates concurrent increments without losing counts', async () => {
    await Promise.all(Array.from({ length: 100 }, () => Promise.resolve().then(() => recordTokenUsage(1))));
    expect((await getBudgetStatus()).tokensUsedToday).toBe(100);
  });

  it('counts usage written by another instance', async () => {
    // 2026-09-17 regression: counters were per-process module state, so a newly
    // booted Cloud Run instance started from zero and re-spent the whole quota
    // while its siblings were already answering 503.
    await recordTokenUsage(TEST_DAILY_TOKENS);

    // A second instance resolving the same ledger must see the same total.
    setAiUsageStore(ledger);

    expect((await getBudgetStatus()).tokensUsedToday).toBe(TEST_DAILY_TOKENS);
    expect(await isBudgetExceeded()).toBe(true);
  });
});

describe('monthly cost budget', () => {
  it('cost estimate participates in the budget', async () => {
    setBudgetPolicy({ monthlyCostLimit: 1 });
    await recordTokenUsage(0, 0.9);
    expect(await isBudgetExceeded()).toBe(false);
    await recordTokenUsage(0, 0.2);
    expect(await isBudgetExceeded()).toBe(true);
    expect((await getBudgetStatus()).costRemaining).toBe(0);
  });

  it('month-to-date cost survives the daily rollover', async () => {
    // The cost counter used to reset with the daily one, which made a MONTHLY
    // limit unreachable. It is now summed over the UTC month.
    setBudgetPolicy({ monthlyCostLimit: 1 });
    await recordTokenUsage(0, 5);
    expect(await isBudgetExceeded()).toBe(true);

    vi.setSystemTime(new Date('2026-08-20T00:00:30Z'));

    const status = await getBudgetStatus();
    expect(status.costEstimateToday).toBe(0); // today's spend only
    expect(status.exceeded).toBe(true); // but the month is still over budget
  });

  it('cost budget resets at the month boundary', async () => {
    setBudgetPolicy({ monthlyCostLimit: 1 });
    await recordTokenUsage(0, 5);
    expect(await isBudgetExceeded()).toBe(true);

    vi.setSystemTime(new Date('2026-09-01T00:00:30Z'));

    expect((await getBudgetStatus()).costRemaining).toBe(1);
    expect(await isBudgetExceeded()).toBe(false);
  });
});

describe('typed exhaustion error', () => {
  it('BudgetExceededError is recognized by the type guard', () => {
    const tokenErr = new BudgetExceededError('token');
    const costErr = new BudgetExceededError('cost');
    expect(isBudgetExceededError(tokenErr)).toBe(true);
    expect(isBudgetExceededError(costErr)).toBe(true);
    expect(isBudgetExceededError(new Error('other'))).toBe(false);
    expect(isBudgetExceededError('string')).toBe(false);
    expect(isBudgetExceededError(null)).toBe(false);
  });

  it('exposes a reason and a user-safe message', () => {
    const err = new BudgetExceededError('token');
    expect(err.reason).toBe('token');
    expect(err.message).not.toContain('http');
    expect(err.name).toBe('BudgetExceededError');
  });
});

describe('policy accessors', () => {
  it('getBudgetPolicy returns a copy, not the live object', () => {
    const p = getBudgetPolicy();
    p.dailyTokenLimit = 1;
    expect(getBudgetPolicy().dailyTokenLimit).toBe(TEST_DAILY_TOKENS);
  });

  it('cost estimate constant is positive', () => {
    expect(ESTIMATED_USD_PER_TOKEN).toBeGreaterThan(0);
    expect(ESTIMATED_USD_PER_TOKEN).toBeLessThan(0.001);
  });
});
