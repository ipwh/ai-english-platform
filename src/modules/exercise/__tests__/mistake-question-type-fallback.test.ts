// ============================================
// 2026-09-15: 錯題題型歸類後備（弱項分析不再是「未分類」）
//
// 症狀：學生的閱讀錯題全部落入 `reading:unclassified`，弱項分析因此永遠顯示
// 「未分類題型」——學生不知道要練什麼。
// 原因：未持久化於正典題庫的閱讀題目（舊 rd-* 即時生成題）解析不到 dseType，
// 而客戶端提交時明明帶著題目生成時的 dseType。
//
// 契約：
//   - 正典定義永遠優先（canonical）
//   - 解析不到時才採用白名單內的客戶端 dseType，並標記 client-claimed
//   - 沒有可用自報值 → unresolved（不推測題型）
//   - 這些值永不參與評分，只用於弱項歸類
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPracticeExecutionTx: vi.fn(),
  scoreReadingAnswers: vi.fn(),
  computeReadingAggregates: vi.fn(),
  createMistakeIfAbsent: vi.fn(),
  recordPracticeSessionMasteryOnce: vi.fn(),
  syncStudentActivityMetrics: vi.fn(),
  resolveReadingQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionDefinitions: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: { createPracticeExecutionTx: mocks.createPracticeExecutionTx },
}));

vi.mock('@/modules/reading/services/reading-answer-scoring', () => ({
  scoreReadingAnswers: mocks.scoreReadingAnswers,
  computeReadingAggregates: mocks.computeReadingAggregates,
}));

vi.mock('@/modules/mistake/db/repositories/mistake-repo', () => ({
  createMistakeIfAbsent: mocks.createMistakeIfAbsent,
}));

vi.mock('@/modules/learning-analytics/services/activity-accounting-service', () => ({
  recordPracticeSessionMasteryOnce: mocks.recordPracticeSessionMasteryOnce,
  syncStudentActivityMetrics: mocks.syncStudentActivityMetrics,
}));

// 正典題庫：預設「查不到」（模擬未持久化的舊 rd-* 題目）。
// 白名單與歸類邏輯保持真實（不 mock mistake-skill-identity）。
vi.mock('@/modules/reading/services/reading-question-service', () => ({
  resolveReadingQuestionDefinitions: mocks.resolveReadingQuestionDefinitions,
}));

vi.mock('@/modules/exercise/services/grammar-question-service', () => ({
  resolveGrammarQuestionDefinitions: mocks.resolveGrammarQuestionDefinitions,
  resolveGrammarQuestionExplanationsMany: vi.fn().mockResolvedValue(new Map()),
}));

import { submitPractice } from '../services/practice-submission-service';

const READING_ANSWER = {
  questionIndex: 0,
  questionId: 'rd-legacy-1',
  questionPrompt: "What does the word 'curiosity' in the last sentence mean?",
  correctAnswer: 'D',
  studentAnswer: 'B',
  isCorrect: false,
  result: 'incorrect' as const,
  awardedScore: 0,
  maxScore: 1,
  countsTowardScore: true,
  timeSpent: 12,
  scoredBy: 'server' as const,
  scoringMethod: 'reading-server-exact-match',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map());
  mocks.createPracticeExecutionTx.mockResolvedValue({ created: true, id: 'ps-1' });
  mocks.scoreReadingAnswers.mockResolvedValue({ ok: true, answers: [READING_ANSWER] });
  mocks.computeReadingAggregates.mockReturnValue({ totalQuestions: 1, correctCount: 0 });
  mocks.createMistakeIfAbsent.mockResolvedValue({ inserted: true });
  mocks.recordPracticeSessionMasteryOnce.mockResolvedValue(true);
  mocks.syncStudentActivityMetrics.mockResolvedValue(undefined);
});

/** 送出一筆閱讀錯題（可帶／不帶客戶端 dseType） */
async function submitReading(dseType?: string) {
  return submitPractice({
    studentId: 'stu-1',
    skill: 'reading',
    skillZh: 'DSE 閱讀模擬',
    difficulty: 'core',
    source: 'dse-reading',
    answers: [{ ...READING_ANSWER, ...(dseType ? { dseType } : {}) }],
  });
}

describe('submitPractice — 閱讀錯題題型歸類', () => {
  it('正典解析不到時，採用白名單內的客戶端 dseType 並標記 client-claimed', async () => {
    const result = await submitReading('vocabulary_in_context');

    expect(result.ok).toBe(true);
    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      questionId: 'rd-legacy-1',
      languageSkill: 'reading',
      questionType: 'vocabulary_in_context',
      skillSource: 'client-claimed',
    }));
  });

  it('白名單外的自報題型被丟棄 → unresolved（不推測）', async () => {
    await submitReading('totally-made-up-type');

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      questionType: null,
      skillSource: 'unresolved',
    }));
  });

  it('沒有自報題型 → unresolved，不冒充題型', async () => {
    await submitReading();

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      questionType: null,
      skillSource: 'unresolved',
    }));
  });

  it('正典定義優先於客戶端自報值', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([
      ['rd-legacy-1', {
        id: 'rd-legacy-1',
        questionType: 'inference',
        dseType: 'inference',
        questionText: 'What does the writer imply?',
        choices: null,
        answer: 'x',
        marks: 1,
        orderIndex: 0,
      }],
    ]));

    await submitReading('vocabulary_in_context');

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      questionType: 'inference',
      skillSource: 'canonical',
    }));
  });

  it('題型自報值永不影響評分結果（錯題答案仍用伺服器評分）', async () => {
    await submitReading('vocabulary_in_context');

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      studentAnswer: 'B',
      correctAnswer: 'D',
    }));
    // 評分欄位由伺服器傳入的 scored answer 決定，非客戶端
    expect(mocks.createPracticeExecutionTx).toHaveBeenCalledWith(expect.objectContaining({
      answers: [expect.objectContaining({
        scoredBy: 'server',
        scoringMethod: 'reading-server-exact-match',
      })],
    }));
  });
});
