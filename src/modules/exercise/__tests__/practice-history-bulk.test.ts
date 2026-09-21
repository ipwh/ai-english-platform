// ============================================
// 2026-09-21 稽核：批次累積投影（全歷史，不得截斷）
// ============================================
// 病根：`/api/admin/export/students` 舊碼以 `sessions: { take: 50 }` 的 nested
// select 交給聚合函式 → 匯出報表的「總題數／總正確數／準確率」只算最新 50 場。
// 本測試證明新批次投影：
//   1. 分頁讀取**全部**場次（不受單一 take 限制）
//   2. 只計已驗證 evidence（`evaluatePracticeEvidence`）
//   3. 無可驗證證據 → accuracy 為 null（不是 0）
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPracticeSessionsWithEvidenceForStudents: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: {
    listPracticeSessionsWithEvidenceForStudents: mocks.listPracticeSessionsWithEvidenceForStudents,
  },
}));

import { aggregateVerifiedTotalsForStudents } from '../services/practice-history-service';

/** 已驗證 evidence row（伺服器答案鍵評分） */
const verifiedRow = (correct: boolean) => ({
  questionId: 'q1',
  result: correct ? 'correct' : 'incorrect',
  awardedScore: correct ? 1 : 0,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'server-key-resolved',
});

/** 不可驗證（客戶端答案鍵）→ 不計入 scored 統計 */
const unverifiedRow = () => ({
  questionId: 'q1',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'client',
  scoringMethod: 'client-key-deterministic',
});

const session = (studentId: string, answers: unknown[], totalQuestions = 1, correctCount = 1) => ({
  studentId,
  skill: 'tenses',
  totalQuestions,
  correctCount,
  source: 'ai-generated',
  startedAt: new Date('2026-09-01T02:00:00Z'),
  answers,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aggregateVerifiedTotalsForStudents', () => {
  it('returns an empty map for no students without querying', async () => {
    const result = await aggregateVerifiedTotalsForStudents([]);
    expect(result.size).toBe(0);
    expect(mocks.listPracticeSessionsWithEvidenceForStudents).not.toHaveBeenCalled();
  });

  it('pages through the FULL history and never truncates at one page', async () => {
    // 第一頁滿頁（模擬 >pageSize 場次）→ 必須繼續讀第二頁
    const pageOne = Array.from({ length: 3 }, () => session('s1', [verifiedRow(true)]));
    const pageTwo = [session('s1', [verifiedRow(true)])];
    mocks.listPracticeSessionsWithEvidenceForStudents
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo);

    const result = await aggregateVerifiedTotalsForStudents(['s1'], { pageSize: 3 });

    expect(mocks.listPracticeSessionsWithEvidenceForStudents).toHaveBeenCalledTimes(2);
    expect(mocks.listPracticeSessionsWithEvidenceForStudents).toHaveBeenNthCalledWith(1, ['s1'], 3, 0);
    expect(mocks.listPracticeSessionsWithEvidenceForStudents).toHaveBeenNthCalledWith(2, ['s1'], 3, 3);
    expect(result.get('s1')?.sessionsCount).toBe(4);
    expect(result.get('s1')?.verifiedTotalQuestions).toBe(4);
  });

  it('counts only verified evidence (client-key rows are recorded but not scored)', async () => {
    mocks.listPracticeSessionsWithEvidenceForStudents.mockResolvedValueOnce([
      session('s1', [verifiedRow(true), verifiedRow(false)]),
      session('s1', [unverifiedRow()]),
    ]);

    const result = await aggregateVerifiedTotalsForStudents(['s1']);
    const totals = result.get('s1')!;

    expect(totals.verifiedTotalQuestions).toBe(2);
    expect(totals.verifiedCorrectCount).toBe(1);
    expect(totals.accuracy).toBe(50);
    // 原始紀錄值仍然計入（engagement 用，不得當分數）
    // 兩場 × 每場 recorded totalQuestions = 1
    expect(totals.recordedTotalQuestions).toBe(2);
    expect(totals.sessionsCount).toBe(2);
  });

  it('never reports 0% when there is no verifiable evidence (null instead)', async () => {
    mocks.listPracticeSessionsWithEvidenceForStudents.mockResolvedValueOnce([
      session('s1', [unverifiedRow()]),
    ]);

    const totals = (await aggregateVerifiedTotalsForStudents(['s1'])).get('s1')!;

    expect(totals.verifiedTotalQuestions).toBe(0);
    expect(totals.accuracy).toBeNull();
  });

  it('omits students with no sessions entirely (caller must render "—")', async () => {
    mocks.listPracticeSessionsWithEvidenceForStudents.mockResolvedValueOnce([
      session('s1', [verifiedRow(true)]),
    ]);

    const result = await aggregateVerifiedTotalsForStudents(['s1', 's2']);

    expect(result.has('s1')).toBe(true);
    expect(result.has('s2')).toBe(false);
  });

  it('aggregates multiple students in one pass', async () => {
    mocks.listPracticeSessionsWithEvidenceForStudents.mockResolvedValueOnce([
      session('s1', [verifiedRow(true)]),
      session('s2', [verifiedRow(false)]),
      session('s2', [verifiedRow(true)]),
    ]);

    const result = await aggregateVerifiedTotalsForStudents(['s1', 's2']);

    expect(result.get('s1')?.accuracy).toBe(100);
    expect(result.get('s2')?.accuracy).toBe(50);
    expect(result.get('s2')?.sessionsCount).toBe(2);
  });
});
