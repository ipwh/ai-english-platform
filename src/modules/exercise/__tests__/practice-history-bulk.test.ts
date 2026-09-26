// ============================================
// 批次累積投影測試（2026-09-21 稽核；2026-09-26 改走 SQL）
// ============================================
// 病根一（2026-09-21）：`/api/admin/export/students` 舊碼以 `sessions: { take: 50 }`
// 的 nested select 交給聚合函式 → 匯出報表的「總題數／總正確數／準確率」只算最新 50 場。
// 本測試鎖定契約：
//   1. 全歷史（不受單一 take 限制）
//   2. 只計已驗證 evidence
//   3. 無可驗證證據 → accuracy 為 null（不是 0）
//   4. 沒有練習的學生**不出現**在結果中（呼叫端顯示「—」）
//
// 2026-09-26（Neon egress）：改為單一 SQL 聚合（`GROUP BY studentId`）。
// 因此「分頁迭代」不再是本檔可測的機制 —— 改為斷言**只發一次查詢、不搬列**，
// 而「列級排除」保證由 SQL 層測試承擔：
//   → `practice-evidence-sql-equivalence.test.ts`（對抗性 fixtures，DB-gated）
//   → `scripts/verify-evidence-sql-equivalence.ts`（真實資料）
//   → `npm run db:verify:metrics-parity`（部署閘門：新舊路徑 0 差異）
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  aggregateVerifiedTotalsForStudentsByIds: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: {
    aggregateVerifiedTotalsForStudentsByIds: mocks.aggregateVerifiedTotalsForStudentsByIds,
  },
}));

import { aggregateVerifiedTotalsForStudents } from '../services/practice-history-service';

/** SQL 聚合回傳的一列（每名學生一列，只有數字） */
const row = (studentId: string, overrides: Record<string, number> = {}) => ({
  studentId,
  verifiedTotalQuestions: 1,
  verifiedCorrectCount: 1,
  recordedTotalQuestions: 1,
  recordedCorrectCount: 1,
  sessionsCount: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aggregateVerifiedTotalsForStudentsByIds.mockResolvedValue([]);
});

describe('aggregateVerifiedTotalsForStudents', () => {
  it('studentIds 為空時回傳空 Map 且不查詢', async () => {
    const result = await aggregateVerifiedTotalsForStudents([]);

    expect(result.size).toBe(0);
    expect(mocks.aggregateVerifiedTotalsForStudentsByIds).not.toHaveBeenCalled();
  });

  it('單次聚合查詢覆蓋全歷史（不再逐列分頁搬運）', async () => {
    mocks.aggregateVerifiedTotalsForStudentsByIds.mockResolvedValueOnce([
      row('s1', { verifiedTotalQuestions: 4, verifiedCorrectCount: 4, sessionsCount: 4 }),
    ]);

    await aggregateVerifiedTotalsForStudents(['s1', 's2']);

    // 一次查詢、一次傳入全部學生 —— 舊碼是 pageSize/skip 迴圈讀所有列
    expect(mocks.aggregateVerifiedTotalsForStudentsByIds).toHaveBeenCalledTimes(1);
    expect(mocks.aggregateVerifiedTotalsForStudentsByIds).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('只計已驗證 evidence；recorded 值保留但不得當分數', async () => {
    mocks.aggregateVerifiedTotalsForStudentsByIds.mockResolvedValueOnce([
      row('s1', {
        verifiedTotalQuestions: 2,
        verifiedCorrectCount: 1,
        recordedTotalQuestions: 9,
        recordedCorrectCount: 9,
      }),
    ]);

    const totals = (await aggregateVerifiedTotalsForStudents(['s1'])).get('s1')!;

    expect(totals.verifiedTotalQuestions).toBe(2);
    expect(totals.verifiedCorrectCount).toBe(1);
    expect(totals.accuracy).toBe(50);
    // 原始紀錄值（engagement 用）仍回報，但不得影響 accuracy
    expect(totals.recordedTotalQuestions).toBe(9);
    expect(totals.recordedCorrectCount).toBe(9);
  });

  it('無可驗證證據時 accuracy 為 null（永不以 0% 冒充「無資料」）', async () => {
    mocks.aggregateVerifiedTotalsForStudentsByIds.mockResolvedValueOnce([
      row('s1', {
        verifiedTotalQuestions: 0,
        verifiedCorrectCount: 0,
        recordedTotalQuestions: 999,
        recordedCorrectCount: 999,
        sessionsCount: 3,
      }),
    ]);

    const totals = (await aggregateVerifiedTotalsForStudents(['s1'])).get('s1')!;

    expect(totals.verifiedTotalQuestions).toBe(0);
    expect(totals.accuracy).toBeNull();
  });

  it('沒有練習的學生完全不出現（呼叫端必須顯示「—」）', async () => {
    mocks.aggregateVerifiedTotalsForStudentsByIds.mockResolvedValueOnce([row('s1')]);

    const result = await aggregateVerifiedTotalsForStudents(['s1', 's2']);

    expect(result.has('s1')).toBe(true);
    expect(result.has('s2')).toBe(false);
  });

  it('多學生一次聚合，各自獨立計算', async () => {
    mocks.aggregateVerifiedTotalsForStudentsByIds.mockResolvedValueOnce([
      row('s1', { verifiedTotalQuestions: 1, verifiedCorrectCount: 1, sessionsCount: 1 }),
      row('s2', { verifiedTotalQuestions: 4, verifiedCorrectCount: 2, sessionsCount: 3 }),
    ]);

    const result = await aggregateVerifiedTotalsForStudents(['s1', 's2']);

    expect(result.get('s1')?.accuracy).toBe(100);
    expect(result.get('s2')?.accuracy).toBe(50);
    expect(result.get('s2')?.sessionsCount).toBe(3);
  });
});
