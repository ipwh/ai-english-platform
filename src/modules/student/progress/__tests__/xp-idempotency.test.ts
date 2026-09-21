import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  xpFindUnique: vi.fn(),
  xpCreate: vi.fn(),
  userUpdate: vi.fn(),
}));

const transactionClient = {
  xpTransaction: {
    findUnique: mocks.xpFindUnique,
    create: mocks.xpCreate,
  },
  user: { update: mocks.userUpdate },
};

vi.mock('@/shared/db/db', () => ({
  db: { $transaction: mocks.transaction },
}));

import { applyXpEventOnce } from '../repositories/progress-repo';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (tx: typeof transactionClient) => Promise<unknown>) => fn(transactionClient));
  mocks.xpFindUnique.mockResolvedValue(null);
  mocks.userUpdate.mockResolvedValue({ id: 'student-1' });
  mocks.xpCreate.mockResolvedValue({ id: 'xp-1' });
});

describe('applyXpEventOnce', () => {
  it('does not increment XP when the same idempotency key already exists', async () => {
    mocks.xpFindUnique.mockResolvedValue({ id: 'xp-existing' });

    const created = await applyXpEventOnce({
      userId: 'student-1', event: 'completeSession', xpAmount: 15,
      metadata: '{}', idempotencyKey: 'practice-complete:session-1',
    });

    expect(created).toBe(false);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.xpCreate).not.toHaveBeenCalled();
  });

  it('increments XP and records the transaction together for a new key', async () => {
    const created = await applyXpEventOnce({
      userId: 'student-1', event: 'completeSession', xpAmount: 15,
      metadata: '{"sessionId":"session-1"}', idempotencyKey: 'practice-complete:session-1',
    });

    expect(created).toBe(true);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ xp: { increment: 15 } }),
    }));
    expect(mocks.xpCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idempotencyKey: 'practice-complete:session-1' }),
    }));
  });
});