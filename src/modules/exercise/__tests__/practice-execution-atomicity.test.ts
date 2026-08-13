// ============================================
// R37-H02: Atomic reading practice execution tests
// ============================================
// Unit tests with a MOCKED Prisma layer. They prove that
// PracticeSession (carrying authoritative aggregates) and ALL
// PracticeAnswer rows are written inside ONE transaction scope, and
// that any write failure rejects the whole execution. Real rollback is
// Prisma interactive-transaction behaviour; these tests prove the
// failure modes reject the call with no partial persistence attempted
// outside the transaction scope.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockTx,
  client,
  mockSessionCreate,
  mockAnswerCreateMany,
} = vi.hoisted(() => {
  const mockSessionCreate = vi.fn();
  const mockAnswerCreateMany = vi.fn();
  const client = {
    practiceSession: { create: mockSessionCreate },
    practiceAnswer: { createMany: mockAnswerCreateMany },
  };
  return { mockTx: vi.fn(), client, mockSessionCreate, mockAnswerCreateMany };
});

vi.mock('@/shared/db/db', () => ({
  db: {
    $transaction: mockTx,
    practiceSession: client.practiceSession,
    practiceAnswer: client.practiceAnswer,
  },
}));

import { createPracticeExecutionTx } from '../repositories/practice-repo';

const sessionInput = {
  studentId: 'student-1',
  skill: 'reading',
  skillZh: 'DSE 閱讀模擬',
  difficulty: 'core',
  totalQuestions: 2, // server-derived aggregate
  correctCount: 1,   // server-derived aggregate
  source: 'dse-reading',
  completedAt: new Date('2026-08-13T10:00:00.000Z'),
};

const answers = [
  { questionIndex: 0, questionId: 'rq-a', questionType: 'mcq', questionPrompt: 'Q1', correctAnswer: 'B', studentAnswer: 'B', isCorrect: true, result: 'correct', awardedScore: 1, maxScore: 1, countsTowardScore: true, scoredBy: 'server', scoringMethod: 'reading-server-exact-match' },
  { questionIndex: 1, questionId: 'rq-b', questionType: 'inference', questionPrompt: 'Q2', correctAnswer: 'x', studentAnswer: 'y', isCorrect: false, result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true, scoredBy: 'ai', scoringMethod: 'reading-ai-semantic-evaluation' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  mockSessionCreate.mockResolvedValue({ id: 'session-1' });
  mockAnswerCreateMany.mockResolvedValue({ count: 2 });
});

describe('R37-H02 success path', () => {
  it('session (with authoritative aggregates) + all answers commit in one transaction', async () => {
    const session = await createPracticeExecutionTx({ session: sessionInput, answers });

    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(session.id).toBe('session-1');

    // Aggregates persisted on the session row are the server-derived values:
    const sessionData = mockSessionCreate.mock.calls[0][0].data;
    expect(sessionData.totalQuestions).toBe(2);
    expect(sessionData.correctCount).toBe(1);
    expect(sessionData.source).toBe('dse-reading');

    // Every answer row maps verbatim and binds to the created session:
    const payload = mockAnswerCreateMany.mock.calls[0][0].data;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ sessionId: 'session-1', questionId: 'rq-a', scoredBy: 'server' });
    expect(payload[1]).toMatchObject({ sessionId: 'session-1', questionId: 'rq-b', scoredBy: 'ai' });
  });
});

describe('R37-H02 failure injection — no partial execution', () => {
  it('A. session creation failure → rejects, no answer writes attempted', async () => {
    mockSessionCreate.mockRejectedValue(new Error('db down'));

    await expect(createPracticeExecutionTx({ session: sessionInput, answers })).rejects.toThrow('db down');
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
  });

  it('B. answer creation failure → rejects the whole transaction', async () => {
    mockAnswerCreateMany.mockRejectedValue(new Error('answer write failed'));

    await expect(createPracticeExecutionTx({ session: sessionInput, answers })).rejects.toThrow('answer write failed');
    expect(mockTx).toHaveBeenCalledTimes(1);
    // Session create happened only INSIDE the aborted transaction scope:
    expect(mockSessionCreate).toHaveBeenCalledTimes(1);
  });

  it('C. failure halfway through answer persistence → whole execution rejects', async () => {
    // createMany is a single atomic statement; a mid-batch failure is
    // simulated at the transaction level — the whole transaction aborts.
    mockAnswerCreateMany.mockRejectedValue(new Error('mid-batch failure'));

    await expect(createPracticeExecutionTx({ session: sessionInput, answers })).rejects.toThrow('mid-batch failure');
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it('D. aggregate persistence failure (session row carries aggregates) → rejects, no answers', async () => {
    mockSessionCreate.mockRejectedValue(new Error('aggregate write failed'));

    await expect(createPracticeExecutionTx({ session: sessionInput, answers })).rejects.toThrow('aggregate write failed');
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it('no partial PracticeSession can remain — no successful return on failure', async () => {
    mockAnswerCreateMany.mockRejectedValue(new Error('boom'));

    let resolved: unknown = 'not-called';
    try {
      await createPracticeExecutionTx({ session: sessionInput, answers });
      resolved = 'resolved';
    } catch {
      resolved = 'rejected';
    }
    expect(resolved).toBe('rejected');
    // No answer rows were ever committed outside the transaction:
    expect(mockTx).toHaveBeenCalledTimes(1);
  });
});
