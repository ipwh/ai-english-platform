// ============================================
// Instant-quota reservation — deterministic race coverage (2026-10-08)
// ============================================
//
// The DB-gated integration suite proves the invariant against real Postgres
// (ielts-concurrency.integration.test.ts), but it cannot pin an exact interleaving: in CI
// 10 concurrent reservations against a cap of 8 granted only 6, because a caller whose
// conditional UPDATE ran BEFORE the row existed was refused the moment the existence read
// showed that a concurrent request had just created it — even though capacity remained.
//
// The db client is stubbed here so each interleaving is exercised deterministically.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/shared/db/db', () => ({
  db: {
    ieltsGenerationQuota: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

const { reserveInstantQuota } = await import('../repositories/ielts-repo');

const ARGS = {
  ownerUserId: 'student-1',
  dayKey: '2026-10-08',
  bucket: 'set' as const,
  cap: 8,
};

beforeEach(() => {
  mockUpdateMany.mockReset();
  mockFindUnique.mockReset();
  mockCreate.mockReset();
});

describe('reserveInstantQuota — first-reservation race', () => {
  it('retries the conditional increment when the row appears mid-flight', async () => {
    // UPDATE matched 0 rows (no row yet) → the caller probes for existence → a concurrent
    // request has meanwhile committed the row with usedCount = 1 → this caller must still
    // compete for a slot instead of being refused.
    mockUpdateMany
      .mockResolvedValueOnce({ count: 0 })   // probe increment: no row
      .mockResolvedValueOnce({ count: 1 });  // retry after the row appeared
    mockFindUnique
      .mockResolvedValueOnce({ usedCount: 1 })  // "at cap?" read inside the failed attempt
      .mockResolvedValueOnce({ usedCount: 1 })  // existence probe
      .mockResolvedValueOnce({ usedCount: 2 }); // slots used after the retry

    const result = await reserveInstantQuota(ARGS);

    expect(result).toEqual({ reserved: true, usedCount: 2 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses truthfully when the existing row is already at the cap', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({ usedCount: 8 });

    const result = await reserveInstantQuota(ARGS);

    expect(result).toEqual({ reserved: false, usedCount: 8 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates the row exactly once for the first reservation of a day', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockFindUnique.mockResolvedValueOnce({ usedCount: 8 }).mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ usedCount: 1 });

    const result = await reserveInstantQuota(ARGS);

    expect(result).toEqual({ reserved: true, usedCount: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('re-increments after losing the INSERT race (P2002)', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mockFindUnique
      .mockResolvedValueOnce({ usedCount: 8 })  // "at cap?" read inside the failed attempt
      .mockResolvedValueOnce(null)              // existence probe: still no row
      .mockResolvedValueOnce({ usedCount: 2 }); // slots used after the retry
    mockCreate.mockRejectedValueOnce({ code: 'P2002' });

    const result = await reserveInstantQuota(ARGS);

    expect(result).toEqual({ reserved: true, usedCount: 2 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  it('propagates a non-unique INSERT failure (never silently refuses)', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockFindUnique.mockResolvedValueOnce({ usedCount: 8 }).mockResolvedValueOnce(null);
    mockCreate.mockRejectedValueOnce(new Error('connection lost'));

    await expect(reserveInstantQuota(ARGS)).rejects.toThrow('connection lost');
  });
});
