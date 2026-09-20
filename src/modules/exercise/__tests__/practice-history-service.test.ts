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

const mocks = vi.hoisted(() => ({ listPracticeSessionsWithEvidence: vi.fn() }));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: { listPracticeSessionsWithEvidence: mocks.listPracticeSessionsWithEvidence },
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

beforeEach(() => vi.clearAllMocks());

describe('getCumulativeSkillTotals — 累積（全歷史）技能題數', () => {
  it('跨分頁累加同一技能，並回傳已驗證題數／正確數', async () => {
    mocks.listPracticeSessionsWithEvidence
      .mockResolvedValueOnce([sessionRow({ id: 'a' }), sessionRow({ id: 'b' })]) // 2 場 × 2 題（1 對 1 錯）
      .mockResolvedValueOnce([sessionRow({ id: 'c' })]);                        // 尾頁不足 pageSize → 停止

    const totals = await getCumulativeSkillTotals(STUDENT, { pageSize: 2 });

    expect(mocks.listPracticeSessionsWithEvidence).toHaveBeenNthCalledWith(1, STUDENT, 2, 0, undefined);
    expect(mocks.listPracticeSessionsWithEvidence).toHaveBeenNthCalledWith(2, STUDENT, 2, 2, undefined);
    expect(totals).toEqual([{ skill: 'tenses', skillZh: '時態', questions: 6, correct: 3 }]);
  });

  it('不同技能分開累加，並按題數多→少排序', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'a', skill: 'tenses', skillZh: '時態' }),
      sessionRow({ id: 'b', skill: 'connectives', skillZh: '連接詞', answers: [verifiedRow()] }),
    ]);

    const totals = await getCumulativeSkillTotals(STUDENT);

    expect(totals).toEqual([
      { skill: 'tenses', skillZh: '時態', questions: 2, correct: 1 },
      { skill: 'connectives', skillZh: '連接詞', questions: 1, correct: 1 },
    ]);
  });

  it('unverifiable 場次（零答案／舊 authority）不計入累積題數', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'no-answers', answers: [] }),
      sessionRow({ id: 'legacy-key', answers: [verifiedRow({ scoringMethod: 'deterministic-answer-comparison' })] }),
    ]);

    await expect(getCumulativeSkillTotals(STUDENT)).resolves.toEqual([]);
  });

  it('單調性契約：新增場次後任何技能的累積題數不得下降', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'a', skill: 'phrasal-verbs', skillZh: '片語動詞', answers: [verifiedRow()] }), // 1 題
    ]);
    const before = await getCumulativeSkillTotals(STUDENT);

    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'new', skill: 'tenses', skillZh: '時態' }),                                   // 新技能
      sessionRow({ id: 'a', skill: 'phrasal-verbs', skillZh: '片語動詞', answers: [verifiedRow()] }), // 舊技能仍在
    ]);
    const after = await getCumulativeSkillTotals(STUDENT);

    const bySkill = (rows: typeof before) => Object.fromEntries(rows.map(r => [r.skill, r.questions]));
    const beforeMap = bySkill(before);
    for (const row of after) {
      expect(row.questions).toBeGreaterThanOrEqual(beforeMap[row.skill] ?? 0);
    }
    expect(bySkill(after)['phrasal-verbs']).toBeGreaterThanOrEqual(1);
  });

  it('maxPages 邊界：避免極端歷史造成無界讀取', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValue([sessionRow()]); // 永遠滿頁
    await getCumulativeSkillTotals(STUDENT, { pageSize: 1, maxPages: 3 });
    expect(mocks.listPracticeSessionsWithEvidence).toHaveBeenCalledTimes(3);
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
