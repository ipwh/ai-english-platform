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

const events = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../governance/events', () => ({ emitIeltsEvent: events.emit }));

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

// ============================================
// Observability (2026-10-09, Sprint 133)
// ============================================
// A SCHEDULED cleanup that fails is otherwise invisible: the only trace would be
// an HTTP 500 in the scheduler's own log, with no counts and no cutoff. These
// tests pin that every run emits exactly one structured event, that a failure
// emits a failure event, and that neither carries anything sensitive.
describe('runIeltsQuotaRetention — observability', () => {
  it('emits exactly ONE completion event per run, with counts and no secrets', async () => {
    mocks.deleteBatch.mockResolvedValue(0);

    await runIeltsQuotaRetention({}, deps());

    const completions = events.emit.mock.calls.filter(
      (call) => call[0] === 'ielts.quota.retention.completed',
    );
    expect(completions).toHaveLength(1);

    const fields = (completions[0]?.[1] ?? {}) as Record<string, unknown>;
    expect(fields.dayKey).toBe(hkDaysAgo(IELTS_QUOTA_RETENTION_DAYS, NOW));
    expect(fields.retentionDays).toBe(IELTS_QUOTA_RETENTION_DAYS);
    expect(fields.dryRun).toBe(false);
    expect(typeof fields.deletedRows).toBe('number');
    expect(typeof fields.batches).toBe('number');
    // Counts and a day key only — never a secret, a token or student content.
    const serialized = JSON.stringify(fields).toLowerCase();
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('@');
  });

  it('emits a failure event and RETHROWS when the cleanup fails', async () => {
    mocks.deleteBatch.mockRejectedValue(new Error('db unreachable'));

    await expect(runIeltsQuotaRetention({}, deps())).rejects.toThrow('db unreachable');

    const failures = events.emit.mock.calls.filter(
      (call) => call[0] === 'ielts.quota.retention.failed',
    );
    expect(failures).toHaveLength(1);
    const fields = (failures[0]?.[1] ?? {}) as Record<string, unknown>;
    expect(String(fields.reason)).toContain('db unreachable');
    // A failed run must never also report success.
    expect(
      events.emit.mock.calls.filter((call) => call[0] === 'ielts.quota.retention.completed'),
    ).toHaveLength(0);
  });
});
