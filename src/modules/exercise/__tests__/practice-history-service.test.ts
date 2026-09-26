// ============================================
// 累積練習投影測試（2026-09-20 稽核）
// ============================================
// 技能掌握度題數原本由「最新 50 場」在客戶端加總，學生練其他技能時
// 舊技能會被擠出視窗 → 題數下降甚至整列消失。本測試鎖定新契約：
//   1. 累積值只由 persisted answer rows 經 evaluatePracticeEvidence 推導；
//   2. 分頁覆蓋全歷史（不受單一 take 截斷）；
//   3. 只升不跌（單調性）；
//   4. 每週摘要使用香港週界線，engagement 與 scored 分開。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPracticeSessionsWithEvidence: vi.fn(),
  aggregateVerifiedTotalsBySkillForStudent: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: {
    listPracticeSessionsWithEvidence: mocks.listPracticeSessionsWithEvidence,
    aggregateVerifiedTotalsBySkillForStudent: mocks.aggregateVerifiedTotalsBySkillForStudent,
  },
}));

import { getCumulativeSkillTotals, getWeeklyPracticeSummary } from '../services/practice-history-service';
import { hkWeekStartUtc } from '@/shared/utils/hk-date';

const STUDENT = 's1';

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

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-1',
  skill: 'tenses',
  skillZh: '時態',
  difficulty: 'core',
  totalQuestions: 5,
  correctCount: 3,
  source: 'ai-generated',
  startedAt: new Date('2026-09-19T10:00:00Z'),
  completedAt: new Date('2026-09-19T10:00:00Z'),
  answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 })],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValue([]);
});

describe('getCumulativeSkillTotals — 累積（全歷史）技能題數', () => {
  it('由 SQL 聚合逐技能加總，並按題數多→少排序', async () => {
    mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValueOnce([
      { skill: 'tenses', skillZh: '時態', verifiedTotalQuestions: 2, verifiedCorrectCount: 1, recordedTotalQuestions: 99, recordedCorrectCount: 99, sessionsCount: 2 },
      { skill: 'connectives', skillZh: '連接詞', verifiedTotalQuestions: 1, verifiedCorrectCount: 1, recordedTotalQuestions: 5, recordedCorrectCount: 5, sessionsCount: 1 },
    ]);

    const totals = await getCumulativeSkillTotals(STUDENT);

    expect(mocks.aggregateVerifiedTotalsBySkillForStudent).toHaveBeenCalledWith(STUDENT);
    expect(totals).toEqual([
      { skill: 'tenses', skillZh: '時態', questions: 2, correct: 1 },
      { skill: 'connectives', skillZh: '連接詞', questions: 1, correct: 1 },
    ]);
  });

  it('全歷史：單次聚合查詢，永不逐列分頁讀取（無 take／maxPages 上限）', async () => {
    mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValueOnce([]);

    await getCumulativeSkillTotals(STUDENT);

    expect(mocks.aggregateVerifiedTotalsBySkillForStudent).toHaveBeenCalledTimes(1);
    // 舊碼以 listPracticeSessionsWithEvidence 分頁搬全歷史每一列 —— egress 主因
    expect(mocks.listPracticeSessionsWithEvidence).not.toHaveBeenCalled();
  });

  it('未達已驗證門檻的技能（verified 0 題）不得顯示', async () => {
    mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValueOnce([
      { skill: 'legacy', skillZh: '舊資料', verifiedTotalQuestions: 0, verifiedCorrectCount: 0, recordedTotalQuestions: 999, recordedCorrectCount: 999, sessionsCount: 3 },
    ]);

    await expect(getCumulativeSkillTotals(STUDENT)).resolves.toEqual([]);
  });

  it('不得以 recorded（場次聚合）值冒充累積題數', async () => {
    mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValueOnce([
      { skill: 'tenses', skillZh: '時態', verifiedTotalQuestions: 3, verifiedCorrectCount: 2, recordedTotalQuestions: 999, recordedCorrectCount: 999, sessionsCount: 1 },
    ]);

    await expect(getCumulativeSkillTotals(STUDENT)).resolves.toEqual([
      { skill: 'tenses', skillZh: '時態', questions: 3, correct: 2 },
    ]);
  });

  it('單調性契約：新增場次後任何技能的累積題數不得下降', async () => {
    mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValueOnce([
      { skill: 'phrasal-verbs', skillZh: '片語動詞', verifiedTotalQuestions: 1, verifiedCorrectCount: 1, recordedTotalQuestions: 1, recordedCorrectCount: 1, sessionsCount: 1 },
    ]);
    const before = await getCumulativeSkillTotals(STUDENT);

    mocks.aggregateVerifiedTotalsBySkillForStudent.mockResolvedValueOnce([
      { skill: 'tenses', skillZh: '時態', verifiedTotalQuestions: 2, verifiedCorrectCount: 1, recordedTotalQuestions: 2, recordedCorrectCount: 1, sessionsCount: 1 },
      { skill: 'phrasal-verbs', skillZh: '片語動詞', verifiedTotalQuestions: 1, verifiedCorrectCount: 1, recordedTotalQuestions: 1, recordedCorrectCount: 1, sessionsCount: 1 },
    ]);
    const after = await getCumulativeSkillTotals(STUDENT);

    const bySkill = (rows: typeof before) => Object.fromEntries(rows.map(r => [r.skill, r.questions]));
    const beforeMap = bySkill(before);
    for (const row of after) {
      expect(row.questions).toBeGreaterThanOrEqual(beforeMap[row.skill] ?? 0);
    }
    expect(bySkill(after)['phrasal-verbs']).toBeGreaterThanOrEqual(1);
  });
});

describe('getWeeklyPracticeSummary — 香港週界線、engagement 與 scored 分離', () => {
  it('查詢用香港週起點（今日往前 6 日 00:00）', async () => {
    const now = new Date('2026-09-19T23:33:00Z');
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([]);
    await getWeeklyPracticeSummary(STUDENT, now);
    const since = mocks.listPracticeSessionsWithEvidence.mock.calls[0][3] as Date;
    expect(since.toISOString()).toBe(hkWeekStartUtc(6, now).toISOString());
  });

  it('engagement 計入所有場次；scored 只計已驗證 evidence', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'verified', totalQuestions: 5, answers: [verifiedRow(), verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }), verifiedRow({ questionId: 'q3', result: 'incorrect', awardedScore: 0 })] }),
      sessionRow({ id: 'unverifiable', totalQuestions: 4, answers: [] }),
    ]);

    const weekly = await getWeeklyPracticeSummary(STUDENT);

    expect(weekly).toEqual({
      questionsDone: 9,       // engagement：9 題（含未驗證）
      sessionsCount: 2,
      verifiedQuestions: 3,   // scored：只有已驗證 3 題
      verifiedCorrect: 1,
      accuracy: 33,
    });
  });

  it('無已驗證資料時 accuracy = null（不得回退存檔聚合值）', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'forged', totalQuestions: 999, correctCount: 999, answers: [] }),
    ]);
    const weekly = await getWeeklyPracticeSummary(STUDENT);
    expect(weekly.verifiedQuestions).toBe(0);
    // 2026-09-20 稽核：無資料 ≠ 0%（顯示層才不會誤報「答錯全部」）
    expect(weekly.accuracy).toBeNull();
  });
});
