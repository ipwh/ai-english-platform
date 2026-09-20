// ============================================
// R3.10-C.2 — H/I: syncActivityMetrics behavioral tests
// Proves overallAccuracy + weekly snapshots derive ONLY from
// canonical verified evidence; forged session aggregates, zero-answer,
// presence and historical sessions never contribute.
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockListSessions,
  mockSubmissionsFindMany,
  mockSnapshotUpsert,
  mockUpdateUser,
} = vi.hoisted(() => ({
  mockListSessions: vi.fn(),
  mockSubmissionsFindMany: vi.fn(),
  mockSnapshotUpsert: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    submission: { findMany: mockSubmissionsFindMany },
    weeklySnapshot: { upsert: mockSnapshotUpsert },
  },
}));

vi.mock('@/modules/exercise/repositories/practice-repo', () => ({
  listPracticeSessionsWithEvidence: mockListSessions,
}));

vi.mock('@/modules/student/repositories/user-repo', () => ({
  updateUser: mockUpdateUser,
}));

import { studentStateMutationService } from '../StudentStateMutationService';

const verifiedRow = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'q1',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'server-key-resolved',
  ...overrides,
});

/** Sessions as returned by listPracticeSessionsWithEvidence */
const session = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  startedAt: new Date(), // today → current week
  answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }), verifiedRow({ questionId: 'q3', result: 'incorrect', awardedScore: 0 })],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmissionsFindMany.mockResolvedValue([]);
  mockSnapshotUpsert.mockResolvedValue({});
  mockUpdateUser.mockResolvedValue({});
});

describe('R3.10-C.2 syncActivityMetrics (H/I)', () => {
  it('H/I.1: forged PracticeSession totals do NOT affect overallAccuracy', async () => {
    mockListSessions.mockResolvedValue([
      session({ totalQuestions: 999, correctCount: 999 }), // forged aggregates
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // row-derived: 1 correct / 3 total → 33
    expect(result.accuracy).toBe(33);
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: 33 });
  });

  it('H/I.2: forged correctCount does NOT affect weekly snapshots', async () => {
    mockListSessions.mockResolvedValue([
      session({ totalQuestions: 777, correctCount: 777 }),
    ]);

    await studentStateMutationService.syncActivityMetrics('student-1');

    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    expect(upsertCall.create.totalQuestions).toBe(3);
    expect(upsertCall.create.correctCount).toBe(1);
    expect(upsertCall.create.accuracy).toBe(33);
    expect(upsertCall.create.sessionsCount).toBe(1);
    expect(upsertCall.update.totalQuestions).toBe(3);
    expect(upsertCall.update.correctCount).toBe(1);
  });

  it('H/I.3: zero-answer sessions do NOT affect accuracy', async () => {
    mockListSessions.mockResolvedValue([
      session({ answers: [] }), // zero-answer / presence
      session({ id: 's2', answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 })] }),
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // only s2 verified: 1 correct / 2 total → 50
    expect(result.accuracy).toBe(50);
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: 50 });
  });

  it('H/I.4: presence sessions (aggregates but no answers) do NOT affect accuracy', async () => {
    mockListSessions.mockResolvedValue([
      session({ totalQuestions: 0, correctCount: 0, answers: [] }),
      session({ id: 's2', answers: [verifiedRow()] }),
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    expect(result.accuracy).toBe(100);
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: 100 });
  });

  it('H/I.5: historical-unverifiable sessions do NOT affect accuracy', async () => {
    mockListSessions.mockResolvedValue([
      session({ answers: [verifiedRow({ scoredBy: 'client' })] }), // historical client authority
      session({ id: 's2', answers: [verifiedRow({ questionId: null })] }), // historical missing identity
      session({ id: 's3', answers: [verifiedRow()] }),
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    expect(result.accuracy).toBe(100);
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: 100 });
  });

  it('H/I.6: verified PracticeAnswer rows DO affect accuracy correctly', async () => {
    mockListSessions.mockResolvedValue([
      session({
        answers: [
          verifiedRow(),
          verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }),
          verifiedRow({ questionId: 'q3' }),
          verifiedRow({ questionId: 'q4', result: 'incorrect', awardedScore: 0 }),
        ],
      }),
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // 2 correct / 4 total → 50
    expect(result.accuracy).toBe(50);
    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    expect(upsertCall.create.totalQuestions).toBe(4);
    expect(upsertCall.create.correctCount).toBe(2);
  });

  it('H/I.7: weekly snapshot excludes sessions outside the current week', async () => {
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 40);
    mockListSessions.mockResolvedValue([
      session({ startedAt: lastMonth }),
      session({ id: 's2', answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 })] }),
    ]);

    await studentStateMutationService.syncActivityMetrics('student-1');

    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    // current-week session only: 1/2
    expect(upsertCall.create.totalQuestions).toBe(2);
    expect(upsertCall.create.correctCount).toBe(1);
    expect(upsertCall.create.sessionsCount).toBe(1);
  });

  it('I.8: 無可驗證證據 → overallAccuracy 寫 null（不是 0），週快照題數為 0', async () => {
    // 2026-09-20 稽核：852 名學生中 837 名 overallAccuracy = 0，均屬「無資料」被寫成 0
    mockListSessions.mockResolvedValue([session({ answers: [] })]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    expect(result.accuracy).toBeNull();
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: null });
    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    expect(upsertCall.create.totalQuestions).toBe(0);
    expect(upsertCall.create.sessionsCount).toBe(0);
  });

  it('I.9: 有評分 submissions 但無已驗證練習 → 仍算得出 accuracy（非 null）', async () => {
    mockListSessions.mockResolvedValue([]);
    mockSubmissionsFindMany.mockResolvedValue([
      { score: 50, submittedAt: new Date(), assignment: { questionCount: 10 } },
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // 5/10 correct → 50
    expect(result.accuracy).toBe(50);
  });
});
