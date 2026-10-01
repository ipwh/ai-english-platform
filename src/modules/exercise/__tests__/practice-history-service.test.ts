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
  listRecentQuestionPrompts: vi.fn(),
  listRecentListeningDialogues: vi.fn(),
  aggregatePracticeSessionsByDayAndSkill: vi.fn(),
  listPracticeSessionsWithAnswersInRange: vi.fn(),
  aggregateVerifiedTotalsForStudent: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: {
    listPracticeSessionsWithEvidence: mocks.listPracticeSessionsWithEvidence,
    aggregateVerifiedTotalsBySkillForStudent: mocks.aggregateVerifiedTotalsBySkillForStudent,
    listRecentQuestionPrompts: mocks.listRecentQuestionPrompts,
    listRecentListeningDialogues: mocks.listRecentListeningDialogues,
    aggregatePracticeSessionsByDayAndSkill: mocks.aggregatePracticeSessionsByDayAndSkill,
    listPracticeSessionsWithAnswersInRange: mocks.listPracticeSessionsWithAnswersInRange,
    aggregateVerifiedTotalsForStudent: mocks.aggregateVerifiedTotalsForStudent,
  },
}));

import {
  getCumulativeSkillTotals,
  getCumulativeSessionsCount,
  getWeeklyPracticeSummary,
  getRecentQuestionPromptsForGeneration,
  getRecentListeningDialoguesForGeneration,
  getPracticeHistoryMonth,
  getPracticeHistoryDay,
  getPracticeHistoryDayForTeacher,
} from '../services/practice-history-service';
import { hkWeekStartUtc, hkMonthStartUtc, hkDayStartUtc, DAY_MS } from '@/shared/utils/hk-date';

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

// ============================================
// 2026-10-01：出題跨請求去重素材 + 練習歷史（逐日回顧）
// ============================================
describe('getRecentQuestionPromptsForGeneration — 出題去重素材', () => {
  it('依正規化（大小寫／空白）去重、去除空字串並保留原文字', async () => {
    mocks.listRecentQuestionPrompts.mockResolvedValueOnce([
      { prompt: 'She ___ to school every day.' },
      { prompt: '  she   ___ TO school EVERY day.  ' },
      { prompt: 'They ___ football on Sundays.' },
      { prompt: '' },
    ]);

    const prompts = await getRecentQuestionPromptsForGeneration(STUDENT, 10);

    expect(mocks.listRecentQuestionPrompts).toHaveBeenCalledWith(STUDENT);
    expect(prompts).toEqual(['She ___ to school every day.', 'They ___ football on Sundays.']);
  });

  it('遵守上限（避免提示詞無限膨脹）', async () => {
    mocks.listRecentQuestionPrompts.mockResolvedValueOnce([
      { prompt: 'Prompt one.' }, { prompt: 'Prompt two.' }, { prompt: 'Prompt three.' },
    ]);
    const prompts = await getRecentQuestionPromptsForGeneration(STUDENT, 2);
    expect(prompts).toEqual(['Prompt one.', 'Prompt two.']);
  });
});

describe('getRecentListeningDialoguesForGeneration — 對話去重素材', () => {
  it('依正規化去重（換行／空白／大小寫視為同一段對話）', async () => {
    mocks.listRecentListeningDialogues.mockResolvedValueOnce([
      { dialogue: 'Boy: When does it start?\nGirl: It starts at ten.' },
      { dialogue: 'BOY: When does it start? Girl: It starts at ten.' },
      { dialogue: '   ' },
    ]);

    const dialogues = await getRecentListeningDialoguesForGeneration(STUDENT, 10);

    expect(mocks.listRecentListeningDialogues).toHaveBeenCalledWith(STUDENT);
    expect(dialogues).toEqual(['Boy: When does it start?\nGirl: It starts at ten.']);
  });
});

describe('getPracticeHistoryMonth — 每日 × 技能聚合（engagement）', () => {
  it('以香港月界線查詢，組成逐日摘要（日新→舊；技能多→少）', async () => {
    mocks.aggregatePracticeSessionsByDayAndSkill.mockResolvedValueOnce([
      { dayKey: '2026-10-01', skill: 'reading', skillZh: '閱讀', sessionsCount: 1, questionsTotal: 5 },
      { dayKey: '2026-10-01', skill: 'tenses', skillZh: '時態', sessionsCount: 2, questionsTotal: 10 },
      { dayKey: '2026-09-30', skill: 'tenses', skillZh: '時態', sessionsCount: 1, questionsTotal: 3 },
    ]);

    const result = await getPracticeHistoryMonth(STUDENT, '2026-10');

    expect(mocks.aggregatePracticeSessionsByDayAndSkill).toHaveBeenCalledWith(
      STUDENT,
      hkMonthStartUtc('2026-10'),
      hkMonthStartUtc('2026-11'),
    );
    expect(result.monthKey).toBe('2026-10');
    expect(result.days.map((d) => d.dayKey)).toEqual(['2026-10-01', '2026-09-30']);
    expect(result.days[0]).toEqual({
      dayKey: '2026-10-01',
      sessionsCount: 3,
      questionsTotal: 15,
      skills: [
        { skill: 'tenses', skillZh: '時態', sessionsCount: 2, questionsTotal: 10 },
        { skill: 'reading', skillZh: '閱讀', sessionsCount: 1, questionsTotal: 5 },
      ],
    });
  });

  it('沒有練習的月份回傳空 days（不得假造資料）', async () => {
    mocks.aggregatePracticeSessionsByDayAndSkill.mockResolvedValueOnce([]);
    const result = await getPracticeHistoryMonth(STUDENT, '2026-08');
    expect(result.days).toEqual([]);
  });
});

describe('getPracticeHistoryDay — 單日逐場明細（有界）', () => {
  it('以香港日界線查詢、按時間舊→新排序、附正典證據投影', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'later', startedAt: new Date('2026-10-01T10:00:00Z') }),
      sessionRow({ id: 'earlier', startedAt: new Date('2026-10-01T02:00:00Z') }),
    ]);

    const result = await getPracticeHistoryDay(STUDENT, '2026-10-01');

    const dayStart = hkDayStartUtc('2026-10-01');
    expect(mocks.listPracticeSessionsWithEvidence).toHaveBeenCalledWith(
      STUDENT,
      201,
      0,
      dayStart,
      new Date(dayStart.getTime() + DAY_MS),
    );
    expect(result.sessions.map((s) => s.id)).toEqual(['earlier', 'later']);
    expect(result.sessions[0].verified).toEqual({
      status: 'verified',
      totalQuestions: 2,
      correctCount: 1,
      accuracy: 50,
    });
    expect(result.truncated).toBe(false);
  });

  it('超過上限時截斷並標示 truncated（極端爆量日）', async () => {
    mocks.listPracticeSessionsWithEvidence.mockResolvedValueOnce([
      sessionRow({ id: 'a' }),
      sessionRow({ id: 'b' }),
      sessionRow({ id: 'c' }),
    ]);

    const result = await getPracticeHistoryDay(STUDENT, '2026-10-01', 2);

    expect(result.sessions).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

// ============================================
// 2026-10-01：教師端逐題明細（單日有界）
// ============================================
const teacherRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-t1',
  skill: 'tenses',
  skillZh: '時態',
  difficulty: 'core',
  totalQuestions: 2,
  correctCount: 1,
  source: 'ai-generated',
  startedAt: new Date('2026-10-01T02:00:00Z'),
  completedAt: new Date('2026-10-01T02:10:00Z'),
  answers: [
    {
      questionIndex: 0, questionId: 'q1', questionType: 'mc', questionPrompt: 'Q1 text',
      correctAnswer: 'A', studentAnswer: 'A', isCorrect: true, result: 'correct',
      awardedScore: 1, maxScore: 1, countsTowardScore: true,
      scoredBy: 'server', scoringMethod: 'server-key-resolved', timeSpent: 12,
    },
    {
      questionIndex: 1, questionId: 'q2', questionType: 'mc', questionPrompt: 'Q2 text',
      correctAnswer: 'B', studentAnswer: 'C', isCorrect: false, result: 'incorrect',
      awardedScore: 0, maxScore: 1, countsTowardScore: true,
      scoredBy: 'server', scoringMethod: 'server-key-resolved', timeSpent: 8,
    },
  ],
  ...overrides,
});

describe('getPracticeHistoryDayForTeacher — 教師端逐題明細', () => {
  it('回傳逐場 + 逐題答案，並以正典證據投影 verified', async () => {
    mocks.listPracticeSessionsWithAnswersInRange.mockResolvedValueOnce([teacherRow()]);

    const result = await getPracticeHistoryDayForTeacher(STUDENT, '2026-10-01');

    const dayStart = hkDayStartUtc('2026-10-01');
    expect(mocks.listPracticeSessionsWithAnswersInRange).toHaveBeenCalledWith(
      STUDENT,
      dayStart,
      new Date(dayStart.getTime() + DAY_MS),
      201,
    );
    expect(result.sessions[0].answers).toHaveLength(2);
    expect(result.sessions[0].answers[1]).toEqual({
      questionIndex: 1,
      questionType: 'mc',
      questionPrompt: 'Q2 text',
      correctAnswer: 'B',
      studentAnswer: 'C',
      isCorrect: false,
      result: 'incorrect',
      timeSpent: 8,
    });
    expect(result.sessions[0].verified).toEqual({
      status: 'verified',
      totalQuestions: 2,
      correctCount: 1,
      accuracy: 50,
    });
    expect(result.truncated).toBe(false);
  });

  it('超過上限時截斷並標示 truncated（單日有界）', async () => {
    mocks.listPracticeSessionsWithAnswersInRange.mockResolvedValueOnce([
      teacherRow({ id: 'a' }),
      teacherRow({ id: 'b' }),
    ]);

    const result = await getPracticeHistoryDayForTeacher(STUDENT, '2026-10-01', 1);

    expect(result.sessions).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});

// ============================================
// 2026-10-01：全歷史「練習次數」（教師端顯示；不得由最新 50 場視窗推算）
// ============================================
describe('getCumulativeSessionsCount — 全歷史練習次數', () => {
  it('回傳 SQL 聚合的 sessionsCount（含不可驗證場次；不受 50 場視窗截斷）', async () => {
    mocks.aggregateVerifiedTotalsForStudent.mockResolvedValueOnce({
      verifiedTotalQuestions: 0,
      verifiedCorrectCount: 0,
      recordedTotalQuestions: 260,
      recordedCorrectCount: 200,
      sessionsCount: 52,
    });

    await expect(getCumulativeSessionsCount(STUDENT)).resolves.toBe(52);
    expect(mocks.aggregateVerifiedTotalsForStudent).toHaveBeenCalledWith(STUDENT);
  });
});
