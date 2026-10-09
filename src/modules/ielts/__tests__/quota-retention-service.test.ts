// ============================================
// IELTS quota retention — batched cleanup (2026-10-08, Sprint 132)
// ============================================
// Pins that retention:
//   * uses the HONG KONG day boundary for its cutoff (never a UTC day)
//   * deletes in BOUNDED batches (never one unbounded delete)
//   * stops at the round cap and reports that work remains
//   * a dry run only counts — it can never delete
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hkDaysAgo } from '@/shared/utils/hk-date';

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  deleteInstantQuotaRowsOlderThan: vi.fn(),
  countInstantQuotaRowsOlderThan: vi.fn(),
}));

import {
  runIeltsQuotaRetention,
  IELTS_QUOTA_RETENTION_DAYS,
  IELTS_QUOTA_RETENTION_BATCH_SIZE,
  IELTS_QUOTA_RETENTION_MAX_BATCHES,
} from '../services/quota-retention-service';

const NOW = new Date('2026-10-08T04:00:00.000Z'); // 12:00 HKT

const mocks = vi.hoisted(() => ({
  deleteBatch: vi.fn(),
  countStale: vi.fn(),
}));

function deps() {
  return { deleteBatch: mocks.deleteBatch, countStale: mocks.countStale, now: () => NOW };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteBatch.mockResolvedValue(0);
  mocks.countStale.mockResolvedValue(0);
});

describe('runIeltsQuotaRetention — cutoff', () => {
  it('uses the Hong Kong day key N days back as the cutoff', async () => {
    mocks.deleteBatch.mockResolvedValue(0);

    const result = await runIeltsQuotaRetention({}, deps());

    expect(result.cutoffDayKey).toBe(hkDaysAgo(IELTS_QUOTA_RETENTION_DAYS, NOW));
    expect(mocks.deleteBatch).toHaveBeenCalledWith(
      hkDaysAgo(IELTS_QUOTA_RETENTION_DAYS, NOW),
      IELTS_QUOTA_RETENTION_BATCH_SIZE,
    );
  });

  it('retains a generous window (>=30 Hong Kong days) so a live counter can never be pruned', () => {
    // 30 days is far beyond any UTC/HKT boundary skew (max 1 day).
    expect(IELTS_QUOTA_RETENTION_DAYS).toBeGreaterThanOrEqual(30);
    expect(IELTS_QUOTA_RETENTION_BATCH_SIZE).toBeLessThanOrEqual(1000);
  });
});

describe('runIeltsQuotaRetention — batched deletion', () => {
  it('drains a backlog and stops on a short batch', async () => {
    mocks.deleteBatch
      .mockResolvedValueOnce(IELTS_QUOTA_RETENTION_BATCH_SIZE) // full batch → keep going
      .mockResolvedValueOnce(120); // short batch → drained

    const result = await runIeltsQuotaRetention({}, deps());

    expect(mocks.deleteBatch).toHaveBeenCalledTimes(2);
    expect(result.deletedRows).toBe(IELTS_QUOTA_RETENTION_BATCH_SIZE + 120);
    expect(result.batches).toBe(2);
    expect(result.moreRemaining).toBe(false);
    expect(result.dryRun).toBe(false);
  });

  it('stops at the round cap and reports that more work remains', async () => {
    mocks.deleteBatch.mockResolvedValue(IELTS_QUOTA_RETENTION_BATCH_SIZE);

    const result = await runIeltsQuotaRetention({}, deps());

    expect(mocks.deleteBatch).toHaveBeenCalledTimes(IELTS_QUOTA_RETENTION_MAX_BATCHES);
    expect(result.deletedRows).toBe(
      IELTS_QUOTA_RETENTION_BATCH_SIZE * IELTS_QUOTA_RETENTION_MAX_BATCHES,
    );
    expect(result.moreRemaining).toBe(true);
  });

  it('is a no-op on an already-clean table (single empty batch)', async () => {
    mocks.deleteBatch.mockResolvedValue(0);

    const result = await runIeltsQuotaRetention({}, deps());

    expect(mocks.deleteBatch).toHaveBeenCalledTimes(1);
    expect(result.deletedRows).toBe(0);
    expect(result.moreRemaining).toBe(false);
  });

  it('never deletes unboundedly: every batch call carries the bounded size', async () => {
    mocks.deleteBatch
      .mockResolvedValueOnce(IELTS_QUOTA_RETENTION_BATCH_SIZE)
      .mockResolvedValueOnce(0);

    await runIeltsQuotaRetention({}, deps());

    for (const call of mocks.deleteBatch.mock.calls) {
      expect(call[1]).toBe(IELTS_QUOTA_RETENTION_BATCH_SIZE);
      expect(call[1]).toBeGreaterThan(0);
    }
  });
});

describe('runIeltsQuotaRetention — dry run', () => {
  it('counts stale rows and NEVER deletes', async () => {
    mocks.countStale.mockResolvedValue(4321);

    const result = await runIeltsQuotaRetention({ dryRun: true }, deps());

    expect(mocks.deleteBatch).not.toHaveBeenCalled();
    expect(result.wouldDelete).toBe(4321);
    expect(result.deletedRows).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(result.cutoffDayKey).toBe(hkDaysAgo(IELTS_QUOTA_RETENTION_DAYS, NOW));
  });

  it('reports an empty backlog as zero with no remaining work', async () => {
    mocks.countStale.mockResolvedValue(0);

    const result = await runIeltsQuotaRetention({ dryRun: true }, deps());

    expect(result.wouldDelete).toBe(0);
    expect(result.moreRemaining).toBe(false);
  });
});
