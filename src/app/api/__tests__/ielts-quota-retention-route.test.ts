// ============================================
// Quota-retention cron route — authorization boundary (2026-10-08, Sprint 132)
// ============================================
// This endpoint deletes rows, so its auth boundary is security-critical:
//   * no CRON_SECRET configured  ⇒ 503 (permanently disabled; NEVER open)
//   * missing / wrong secret     ⇒ 401
//   * correct secret             ⇒ runs, and the secret never appears in a response
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  runIeltsQuotaRetention: vi.fn(),
  IELTS_QUOTA_RETENTION_DAYS: 30,
}));

vi.mock('@/modules/ielts', () => ({
  runIeltsQuotaRetention: mocks.runIeltsQuotaRetention,
  IELTS_QUOTA_RETENTION_DAYS: mocks.IELTS_QUOTA_RETENTION_DAYS,
}));

import { GET } from '../admin/ielts/quota-retention/route';

const SECRET = 'unit-test-cron-secret';

function request(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`https://example.test/api/admin/ielts/quota-retention${query}`, {
    method: 'GET',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mocks.runIeltsQuotaRetention.mockResolvedValue({
    cutoffDayKey: '2026-09-08',
    deletedRows: 12,
    batches: 1,
    moreRemaining: false,
    dryRun: false,
    wouldDelete: 0,
  });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/admin/ielts/quota-retention — authorization', () => {
  it('is permanently disabled (503) when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(request('?secret=anything'));

    expect(res.status).toBe(503);
    expect(mocks.runIeltsQuotaRetention).not.toHaveBeenCalled();
  });

  it('rejects a missing secret with 401 and does not run', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(mocks.runIeltsQuotaRetention).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret with 401 and does not run', async () => {
    const res = await GET(request('?secret=nope'));

    expect(res.status).toBe(401);
    expect(mocks.runIeltsQuotaRetention).not.toHaveBeenCalled();
  });

  it('accepts the secret via the header (avoids leaking it into URL logs)', async () => {
    const res = await GET(request('', { 'x-cron-secret': SECRET }));

    expect(res.status).toBe(200);
    expect(mocks.runIeltsQuotaRetention).toHaveBeenCalledTimes(1);
  });

  it('runs retention and returns counters only (no secret echoed)', async () => {
    const res = await GET(request(`?secret=${SECRET}`));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(mocks.runIeltsQuotaRetention).toHaveBeenCalledWith({ dryRun: false });
    expect(body.deletedRows).toBe(12);
    expect(body.cutoffDayKey).toBe('2026-09-08');
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('passes dryRun through so an operator can inspect the backlog first', async () => {
    mocks.runIeltsQuotaRetention.mockResolvedValue({
      cutoffDayKey: '2026-09-08',
      deletedRows: 0,
      batches: 0,
      moreRemaining: true,
      dryRun: true,
      wouldDelete: 999,
    });

    const res = await GET(request(`?secret=${SECRET}&dryRun=true`));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(mocks.runIeltsQuotaRetention).toHaveBeenCalledWith({ dryRun: true });
    expect(body.wouldDelete).toBe(999);
    expect(body.deletedRows).toBe(0);
  });

  it('surfaces a retention failure as 500 without leaking internals beyond the message', async () => {
    mocks.runIeltsQuotaRetention.mockRejectedValue(new Error('db unreachable'));

    const res = await GET(request(`?secret=${SECRET}`));

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('db unreachable');
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
});
