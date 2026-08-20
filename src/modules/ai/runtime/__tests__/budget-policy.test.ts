// ============================================
// AI-001 budget policy tests — real UTC-day rollover semantics,
// cost participation, boundary behavior, and the typed exhaustion error.
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BudgetExceededError,
  ESTIMATED_USD_PER_TOKEN,
  getBudgetPolicy,
  getBudgetStatus,
  isBudgetExceeded,
  isBudgetExceededError,
  recordTokenUsage,
  resetBudgetTracking,
  setBudgetPolicy,
} from '../budget-policy';

const DEFAULT_DAILY_TOKENS = 500000;
const DEFAULT_MONTHLY_COST = 50;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-19T12:00:00Z'));
  resetBudgetTracking();
  setBudgetPolicy({ dailyTokenLimit: DEFAULT_DAILY_TOKENS, monthlyCostLimit: DEFAULT_MONTHLY_COST });
});

afterEach(() => {
  vi.useRealTimers();
  resetBudgetTracking();
  setBudgetPolicy({ dailyTokenLimit: DEFAULT_DAILY_TOKENS, monthlyCostLimit: DEFAULT_MONTHLY_COST });
});

describe('daily token budget', () => {
  it('allows usage under the limit', () => {
    recordTokenUsage(1000);
    expect(isBudgetExceeded()).toBe(false);
    expect(getBudgetStatus().tokensUsedToday).toBe(1000);
  });

  it('exact boundary blocks new calls; one token under does not', () => {
    recordTokenUsage(DEFAULT_DAILY_TOKENS - 1);
    expect(isBudgetExceeded()).toBe(false);
    recordTokenUsage(1);
    expect(isBudgetExceeded()).toBe(true);
    expect(getBudgetStatus().tokensRemaining).toBe(0);
  });

  it('resets naturally at the next UTC day boundary', () => {
    recordTokenUsage(DEFAULT_DAILY_TOKENS);
    expect(isBudgetExceeded()).toBe(true);

    // Advance to 00:00:30 UTC of the next day.
    vi.setSystemTime(new Date('2026-08-20T00:00:30Z'));

    const status = getBudgetStatus();
    expect(status.tokensUsedToday).toBe(0);
    expect(status.exceeded).toBe(false);
    expect(isBudgetExceeded()).toBe(false);
  });

  it('does not reset within the same UTC day', () => {
    recordTokenUsage(100);
    vi.setSystemTime(new Date('2026-08-19T23:59:59Z'));
    expect(getBudgetStatus().tokensUsedToday).toBe(100);
  });

  it('accumulates concurrent increments without losing counts', async () => {
    await Promise.all(Array.from({ length: 100 }, () => Promise.resolve().then(() => recordTokenUsage(1))));
    expect(getBudgetStatus().tokensUsedToday).toBe(100);
  });
});

describe('monthly cost budget', () => {
  it('cost estimate participates in the budget', () => {
    setBudgetPolicy({ monthlyCostLimit: 1 });
    recordTokenUsage(0, 0.9);
    expect(isBudgetExceeded()).toBe(false);
    recordTokenUsage(0, 0.2);
    expect(isBudgetExceeded()).toBe(true);
    expect(getBudgetStatus().costRemaining).toBe(0);
  });

  it('cost budget also resets on day rollover', () => {
    setBudgetPolicy({ monthlyCostLimit: 1 });
    recordTokenUsage(0, 5);
    expect(isBudgetExceeded()).toBe(true);
    vi.setSystemTime(new Date('2026-08-20T00:00:30Z'));
    expect(isBudgetExceeded()).toBe(false);
    expect(getBudgetStatus().costEstimateToday).toBe(0);
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
    expect(getBudgetPolicy().dailyTokenLimit).toBe(DEFAULT_DAILY_TOKENS);
  });

  it('cost estimate constant is positive', () => {
    expect(ESTIMATED_USD_PER_TOKEN).toBeGreaterThan(0);
    expect(ESTIMATED_USD_PER_TOKEN).toBeLessThan(0.001);
  });
});
