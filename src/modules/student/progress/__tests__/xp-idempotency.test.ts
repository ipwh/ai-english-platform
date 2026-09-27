import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  xpFindUnique: vi.fn(),
  xpCreate: vi.fn(),
  userUpdate: vi.fn(),
  userFindUnique: vi.fn(),
}));

const transactionClient = {
  xpTransaction: {
    findUnique: mocks.xpFindUnique,
    create: mocks.xpCreate,
  },
  user: { update: mocks.userUpdate },
};

vi.mock('@/shared/db/db', () => ({
  db: {
    $transaction: mocks.transaction,
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { applyXpEventOnce } from '../repositories/progress-repo';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (tx: typeof transactionClient) => Promise<unknown>) => fn(transactionClient));
  mocks.xpFindUnique.mockResolvedValue(null);
  mocks.userUpdate.mockResolvedValue({ xp: 25 });
  mocks.xpCreate.mockResolvedValue({ id: 'xp-1' });
  mocks.userFindUnique.mockResolvedValue({ xp: 25 });
});

describe('applyXpEventOnce', () => {
  it('does not increment XP when the same idempotency key already exists', async () => {
    mocks.xpFindUnique.mockResolvedValue({ id: 'xp-existing' });

    const outcome = await applyXpEventOnce({
      userId: 'student-1', event: 'completeSession', xpAmount: 15,
      metadata: '{}', idempotencyKey: 'practice-complete:session-1',
    });

    expect(outcome).toEqual({ created: false, xp: null });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.xpCreate).not.toHaveBeenCalled();
  });

  it('increments XP and records the transaction together for a new key', async () => {
    const outcome = await applyXpEventOnce({
      userId: 'student-1', event: 'completeSession', xpAmount: 15,
      metadata: '{"sessionId":"session-1"}', idempotencyKey: 'practice-complete:session-1',
    });

    expect(outcome).toEqual({ created: true, xp: 25 });
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ xp: { increment: 15 } }),
    }));
    expect(mocks.xpCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idempotencyKey: 'practice-complete:session-1' }),
    }));
  });

  // 2026-09-27 事故：交易護欄——避免交易無限等待連線（高併發時堆叠成 500）。
  it('bounds the interactive transaction (maxWait / timeout)', async () => {
    await applyXpEventOnce({
      userId: 'student-1', event: 'answerCorrect', xpAmount: 3, metadata: '{}',
    });

    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5_000, timeout: 10_000 },
    );
  });

  // P2002 若在交易內捕捉後繼續查詢，Postgres 會回「current transaction is aborted」；
  // 正確做法是讓交易回滾，改在交易外讀取現值。
  it('resolves a P2002 race by reading current XP OUTSIDE the transaction', async () => {
    mocks.xpCreate.mockImplementationOnce(async () => {
      const err = new Error('Unique constraint failed') as Error & { code?: string };
      err.code = 'P2002';
      throw err;
    });
    mocks.userFindUnique.mockResolvedValue({ xp: 47 });

    const outcome = await applyXpEventOnce({
      userId: 'student-1', event: 'completeSession', xpAmount: 15,
      metadata: '{}', idempotencyKey: 'practice-complete:session-1',
    });

    expect(outcome).toEqual({ created: false, xp: 47 });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { id: 'student-1' }, select: { xp: true } });
  });
});