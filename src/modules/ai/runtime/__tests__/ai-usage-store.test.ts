// ============================================
// AiUsageStore tests — the counters behind the daily AI budget.
//
// Covers the memory ledger contract, the Prisma ledger's degraded mode, and
// store resolution (unit tests must never reach a real database).
// ============================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryAiUsageStore,
  PrismaAiUsageStore,
  getAiUsageStore,
  setAiUsageStore,
} from '../ai-usage-store';

afterEach(() => {
  setAiUsageStore(null);
  vi.restoreAllMocks();
  vi.doUnmock('@/shared/db/db');
});

describe('MemoryAiUsageStore', () => {
  it('reads an untouched day as zeroes', async () => {
    const store = new MemoryAiUsageStore();
    expect(await store.readDay('2026-09-17')).toEqual({
      dayKey: '2026-09-17',
      tokens: 0,
      costUsd: 0,
    });
  });

  it('accumulates tokens and cost per day', async () => {
    const store = new MemoryAiUsageStore();
    await store.addUsage('2026-09-17', 1000, 0.001);
    await store.addUsage('2026-09-17', 500, 0.0005);

    expect(await store.readDay('2026-09-17')).toEqual({
      dayKey: '2026-09-17',
      tokens: 1500,
      costUsd: 0.0015,
    });
    expect(await store.readDay('2026-09-18')).toEqual({
      dayKey: '2026-09-18',
      tokens: 0,
      costUsd: 0,
    });
  });

  it('sums month cost across days and ignores other months', async () => {
    const store = new MemoryAiUsageStore();
    await store.addUsage('2026-08-31', 0, 1.5);
    await store.addUsage('2026-09-01', 0, 2.25);
    await store.addUsage('2026-09-30', 0, 0.25);

    expect(await store.readMonthCost('2026-09')).toBe(2.5);
    expect(await store.readMonthCost('2026-08')).toBe(1.5);
    expect(await store.readMonthCost('2027-01')).toBe(0);
  });

  it('does not lose concurrent increments', async () => {
    const store = new MemoryAiUsageStore();
    await Promise.all(Array.from({ length: 50 }, () => store.addUsage('2026-09-17', 2, 0)));

    expect((await store.readDay('2026-09-17')).tokens).toBe(100);
  });
});

describe('PrismaAiUsageStore', () => {
  it('degrades to in-process counters instead of throwing when the ledger is unreachable', async () => {
    // A ledger outage must not take AI down — the gate falls back to the
    // process-local mirror and the failure is logged.
    vi.doMock('@/shared/db/db', () => ({
      db: {
        aiDailyUsage: {
          findUnique: () => Promise.reject(new Error('db down')),
          aggregate: () => Promise.reject(new Error('db down')),
          upsert: () => Promise.reject(new Error('db down')),
        },
      },
    }));

    const store = new PrismaAiUsageStore();
    await expect(store.addUsage('2026-09-17', 42, 0.0001)).resolves.toBeUndefined();
    expect(await store.readDay('2026-09-17')).toEqual({
      dayKey: '2026-09-17',
      tokens: 42,
      costUsd: 0.0001,
    });
    expect(await store.readMonthCost('2026-09')).toBe(0.0001);
  });
});

describe('store resolution', () => {
  it('resolves a memory ledger under test runners', () => {
    setAiUsageStore(null);
    expect(getAiUsageStore()).toBeInstanceOf(MemoryAiUsageStore);
  });

  it('returns the injected ledger', () => {
    const injected = new MemoryAiUsageStore();
    setAiUsageStore(injected);
    expect(getAiUsageStore()).toBe(injected);
  });

  it('re-resolves after being cleared', () => {
    const injected = new MemoryAiUsageStore();
    setAiUsageStore(injected);
    setAiUsageStore(null);
    expect(getAiUsageStore()).not.toBe(injected);
  });
});
