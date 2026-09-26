// ============================================
// R3.10-C.2 — H/I: syncActivityMetrics behavioral tests
// Proves overallAccuracy + weekly snapshots derive ONLY from
// canonical verified evidence; forged session aggregates, zero-answer,
// presence and historical sessions never contribute.
//
// 2026-09-26（Neon egress）契約調整：
//   全歷史改由 SQL 聚合提供（**只回傳數字**，不再把每一列搬進 Node），
//   因此服務層再也看不到全歷史的列。保證因此分成兩層：
//
//   (A) 仍由本檔保證（服務層仍負責）：
//       · 使用 `verified*` 欄位，永不採用 `recorded*`（偽造聚合值不得冒充）
//       · 無可驗證證據 → `null`（不是 0）
//       · 週窗以**香港週一**為 `since` 的有界抓取 + 原本 `weekKey` 過濾
//       · 已評分 submissions 併入全歷史與週快照
//       · **失敗一律往上拋（fail-closed）**：不得以 catch-to-empty 把 DB 故障
//         靜默寫成 `null`（那會覆蓋原本正確的準確率，並令呼叫端保護失效）
//
//   (B) 已移至 SQL 層保證（本檔若再重現，斷言將**恆真**而失去意義）：
//       零答案／presence／legacy authority 等**列級排除**，以及
//       **場次層級 all-or-nothing**（同一場次內一列 legacy ⇒ 整場不可驗證）
//       → `practice-evidence-sql-equivalence.test.ts`（對抗性 fixtures，DB-gated）
//       → `scripts/verify-evidence-sql-equivalence.ts`（真實資料，82 名學生）
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockListSessions,
  mockAggregateVerified,
  mockSubmissionsFindMany,
  mockSnapshotUpsert,
  mockUpdateUser,
} = vi.hoisted(() => ({
  mockListSessions: vi.fn(),
  mockAggregateVerified: vi.fn(),
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
  aggregateVerifiedTotalsForStudent: mockAggregateVerified,
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

/** Sessions as returned by listPracticeSessionsWithEvidence（本週抓取） */
const session = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  startedAt: new Date(), // today → current week
  answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }), verifiedRow({ questionId: 'q3', result: 'incorrect', awardedScore: 0 })],
  ...overrides,
});

/** 全歷史 SQL 聚合的回傳形狀 */
const ZERO_TOTALS = {
  verifiedTotalQuestions: 0,
  verifiedCorrectCount: 0,
  recordedTotalQuestions: 0,
  recordedCorrectCount: 0,
  sessionsCount: 0,
};
const totals = (overrides: Record<string, number> = {}) => ({ ...ZERO_TOTALS, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mockAggregateVerified.mockResolvedValue(totals());
  mockListSessions.mockResolvedValue([]);
  mockSubmissionsFindMany.mockResolvedValue([]);
  mockSnapshotUpsert.mockResolvedValue({});
  mockUpdateUser.mockResolvedValue({});
});

describe('R3.10-C.2 syncActivityMetrics (H/I)', () => {
  it('H/I.1: 全歷史採用 verified 欄位，永不採用 recorded（偽造聚合值不得冒充）', async () => {
    mockAggregateVerified.mockResolvedValue(totals({
      verifiedTotalQuestions: 3,
      verifiedCorrectCount: 1,
      recordedTotalQuestions: 999,
      recordedCorrectCount: 999,
    }));

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    expect(result.accuracy).toBe(33);
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: 33 });
  });

  it('H/I.2: 週快照由本週已驗證場次推導，recorded 值不得滲入', async () => {
    mockAggregateVerified.mockResolvedValue(totals({ recordedTotalQuestions: 1998, recordedCorrectCount: 1998 }));
    mockListSessions.mockResolvedValue([session({ totalQuestions: 777, correctCount: 777 })]);

    await studentStateMutationService.syncActivityMetrics('student-1');

    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    expect(upsertCall.create.totalQuestions).toBe(3);
    expect(upsertCall.create.correctCount).toBe(1);
    expect(upsertCall.create.accuracy).toBe(33);
    expect(upsertCall.create.sessionsCount).toBe(1);
  });

  it('H/I.3: 本週抓取以香港週一為界（有界），且非本週場次仍被排除', async () => {
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 40);
    mockListSessions.mockResolvedValue([
      session({ id: 'old', startedAt: lastMonth }),
      session({ id: 'current', answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 })] }),
    ]);

    await studentStateMutationService.syncActivityMetrics('student-1');

    // 有界：第 4 個參數必須是 since（Date），否則就是無界全歷史讀取
    const since = mockListSessions.mock.calls[0][3] as Date;
    expect(since).toBeInstanceOf(Date);
    expect(since.getTime()).toBeLessThanOrEqual(Date.now());

    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    // 只有本週那一場計入：1/2
    expect(upsertCall.create.totalQuestions).toBe(2);
    expect(upsertCall.create.correctCount).toBe(1);
    expect(upsertCall.create.sessionsCount).toBe(1);
  });

  it('H/I.4: 全歷史只走單次 SQL 聚合查詢，永不無界逐列讀取', async () => {
    await studentStateMutationService.syncActivityMetrics('student-1');

    expect(mockAggregateVerified).toHaveBeenCalledTimes(1);
    expect(mockAggregateVerified).toHaveBeenCalledWith('student-1');
    // 所有逐列讀取都必須帶 since（本週有界）—— 舊碼是無界全歷史分頁
    for (const call of mockListSessions.mock.calls) {
      expect(call[3]).toBeInstanceOf(Date);
    }
  });

  it('I.5: 無可驗證證據 → overallAccuracy 寫 null（不是 0），週快照題數為 0', async () => {
    mockAggregateVerified.mockResolvedValue(totals());

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    expect(result.accuracy).toBeNull();
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: null });
    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    expect(upsertCall.create.totalQuestions).toBe(0);
    expect(upsertCall.create.sessionsCount).toBe(0);
  });

  it('I.6: 有評分 submissions 但無已驗證練習 → 仍算得出 accuracy（非 null）', async () => {
    mockSubmissionsFindMany.mockResolvedValue([
      { score: 50, submittedAt: new Date(), assignment: { questionCount: 10 } },
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // 5/10 correct → 50
    expect(result.accuracy).toBe(50);
  });

  it('I.7: 全歷史 = 已驗證練習 + 已評分 submissions（兩者同一組加總）', async () => {
    mockAggregateVerified.mockResolvedValue(totals({ verifiedTotalQuestions: 8, verifiedCorrectCount: 4 }));
    mockSubmissionsFindMany.mockResolvedValue([
      { score: 100, submittedAt: new Date(), assignment: { questionCount: 2 } },
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // (4 + 2) / (8 + 2) = 60
    expect(result.accuracy).toBe(60);
  });

  it('I.8: 聚合失敗必須往上拋（fail-closed），且不得寫入任何值', async () => {
    // 舊碼以 `.catch(() => [])` 吞掉讀取失敗 → 寫入 null 覆蓋原本正確的準確率，
    // 而且正常返回令呼叫端的 fail-closed 保護永遠不觸發（2026-09-26 修正）。
    mockAggregateVerified.mockRejectedValue(new Error('db down'));

    await expect(studentStateMutationService.syncActivityMetrics('student-1')).rejects.toThrow('db down');

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSnapshotUpsert).not.toHaveBeenCalled();
  });

  it('I.9: 本週場次抓取失敗亦必須往上拋，不得寫出錯誤的週快照', async () => {
    mockListSessions.mockRejectedValue(new Error('sessions unavailable'));

    await expect(studentStateMutationService.syncActivityMetrics('student-1')).rejects.toThrow('sessions unavailable');

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSnapshotUpsert).not.toHaveBeenCalled();
  });
});
