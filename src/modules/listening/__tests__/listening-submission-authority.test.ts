// ============================================
// 2026-09-21 ADR-045: 聆聽提交的伺服器權威（端到端）
// ============================================
// 病根：聆聽一直沒有伺服器題目庫，因此即使學生在「AI 練習」做完聆聽題，
// `classifyPracticeSubmission()` 也只會判為 legacy-language-skill →
// 不產生可驗證證據、不更新掌握度、不建錯題（學生看到「已完成」但統計不變）。
// 修正：交付前持久化 ListeningQuestion；提交時由 questionId 解析權威，
// 以 `listening-server-exact-match` 評分（客戶端自報值一律忽略）。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPracticeExecutionTx: vi.fn(),
  createMistakeIfAbsent: vi.fn(),
  recordPracticeSessionMasteryOnce: vi.fn(),
  syncStudentActivityMetrics: vi.fn(),
  scoreReadingAnswers: vi.fn(),
  computeReadingAggregates: vi.fn(),
  resolveReadingQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionDefinitions: vi.fn(),
  resolveListeningQuestionDefinitions: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  PracticeRepo: { createPracticeExecutionTx: mocks.createPracticeExecutionTx },
}));

// 閱讀評分（含 AI facade）與本測試無關：整組替換以免載入 Prisma client
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

vi.mock('@/modules/reading/services/reading-question-service', () => ({
  resolveReadingQuestionDefinitions: mocks.resolveReadingQuestionDefinitions,
}));

vi.mock('@/modules/exercise/services/grammar-question-service', () => ({
  resolveGrammarQuestionDefinitions: mocks.resolveGrammarQuestionDefinitions,
  resolveGrammarQuestionExplanationsMany: vi.fn().mockResolvedValue(new Map()),
}));

// 只 mock 題庫存取；聆聽評分邏輯保持真實（合約測試必須測到真正的比對規則）
vi.mock('@/modules/listening/services/listening-question-service', () => ({
  resolveListeningQuestionDefinitions: mocks.resolveListeningQuestionDefinitions,
}));

import { submitPractice } from '@/modules/exercise/services/practice-submission-service';

function listeningDef(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lq-1',
    questionType: 'mc',
    listeningType: null,
    questionText: 'What time does the tour start?',
    choices: ['At nine', 'At ten', 'At eleven'],
    answer: 'B',
    marks: 1,
    orderIndex: 0,
    dialogue: 'The tour starts at ten.',
    ...overrides,
  };
}

function grammarDef(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gq-1',
    questionType: 'mc',
    prompt: 'Choose the correct form.',
    promptZh: null,
    choices: ['go', 'goes'],
    answer: 'A',
    acceptedAnswers: null,
    grammarItem: 'tenses',
    languageSkill: null,
    difficulty: 'core',
    gradeLevel: 'S4',
    provenance: 'ai-generated',
    ...overrides,
  };
}

/** 客戶端提交列（刻意夾帶偽造的自評欄位） */
function forgedAnswer(overrides: Record<string, unknown> = {}) {
  return {
    questionIndex: 0,
    questionId: 'lq-1',
    questionPrompt: 'What time does the tour start?',
    correctAnswer: 'A',
    studentAnswer: 'B',
    isCorrect: false,
    result: 'incorrect',
    awardedScore: 0,
    maxScore: 1,
    countsTowardScore: true,
    timeSpent: 9,
    ...overrides,
  };
}

async function submit(answers: unknown[], extra: Record<string, unknown> = {}) {
  return submitPractice({
    studentId: 'stu-1',
    skill: 'listening',
    skillZh: 'DSE 聆聽',
    difficulty: 'core',
    source: 'dse-listening',
    answers,
    ...extra,
  } as Parameters<typeof submitPractice>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveListeningQuestionDefinitions.mockResolvedValue(new Map([['lq-1', listeningDef()]]));
  mocks.createPracticeExecutionTx.mockResolvedValue({ created: true, id: 'ps-listen-1' });
  mocks.createMistakeIfAbsent.mockResolvedValue({ inserted: true });
  mocks.recordPracticeSessionMasteryOnce.mockResolvedValue(true);
  mocks.syncStudentActivityMetrics.mockResolvedValue(undefined);
});

describe('submitPractice — 聆聽題目由伺服器答案鍵評分', () => {
  it('伺服器解析為聆聽 → 寫入 listening-server-exact-match 證據（客戶端 isCorrect 被忽略）', async () => {
    const result = await submit([forgedAnswer({ studentAnswer: 'B' })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.submissionClass).toBe('listening');

    const persisted = mocks.createPracticeExecutionTx.mock.calls[0][0];
    expect(persisted.answers[0]).toMatchObject({
      scoredBy: 'server',
      scoringMethod: 'listening-server-exact-match',
      result: 'correct',
      isCorrect: true,
    });
    // 客戶端偽造的自評永不採用
    expect(persisted.answers[0].correctAnswer).toBe('B');
    // 統計由伺服器評分推導
    expect(persisted.session).toMatchObject({ totalQuestions: 1, correctCount: 1, source: 'dse-listening', skill: 'listening' });
  });

  it('答錯 → 建錯題，技能歸屬由正典題目定義（canonical）', async () => {
    await submit([forgedAnswer({ studentAnswer: 'A', isCorrect: true })]);

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'stu-1',
      questionId: 'lq-1',
      studentAnswer: 'A',
      correctAnswer: 'B',
      mistakeType: 'comprehension',
      languageSkill: 'listening',
      skillSource: 'canonical',
    }));
  });

  it('掌握度只在伺服器評分可推導時更新（總題數 > 0）', async () => {
    await submit([forgedAnswer({ studentAnswer: 'B' })]);
    expect(mocks.recordPracticeSessionMasteryOnce).toHaveBeenCalledTimes(1);

    mocks.recordPracticeSessionMasteryOnce.mockClear();
    // 歷史題目（ai-* 本機 id）→ 無法解析 → 不得更新掌握度
    mocks.resolveListeningQuestionDefinitions.mockResolvedValue(new Map());
    await submit([forgedAnswer({ questionId: 'ai-1700000000-0' })]);
    expect(mocks.recordPracticeSessionMasteryOnce).not.toHaveBeenCalled();
  });

  it('歷史聆聽題（無伺服器 id）→ 回退 legacy 儲存，不製造證據但不阻斷學生', async () => {
    mocks.resolveListeningQuestionDefinitions.mockResolvedValue(new Map());

    const result = await submit([forgedAnswer({ questionId: 'ai-1700000000-0' })]);

    // 練習記錄仍然保留（fail-open），但一律不可驗證
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.masteryUpdated).toBe(false);
    const persisted = mocks.createPracticeExecutionTx.mock.calls[0][0];
    expect(persisted.answers[0].scoringMethod).toBe('client-key-deterministic');
    // 客戶端自評列永不變成錯題或掌握度
    expect(mocks.createMistakeIfAbsent).not.toHaveBeenCalled();
    expect(mocks.recordPracticeSessionMasteryOnce).not.toHaveBeenCalled();
  });

  it('客戶端聲稱 listening 但題目其實是文法 → 伺服器家族勝出（不得冒充聆聽）', async () => {
    mocks.resolveListeningQuestionDefinitions.mockResolvedValue(new Map());
    mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map([['lq-1', grammarDef()]]));

    const result = await submit([forgedAnswer()]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.submissionClass).toBe('grammar');
  });

  it('同一批題目混合閱讀與聆聽 → 回退 legacy（不部分計分，也不製造證據）', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([['rq-9', {}]]));

    const result = await submit([
      forgedAnswer(),
      forgedAnswer({ questionIndex: 1, questionId: 'rq-9' }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const persisted = mocks.createPracticeExecutionTx.mock.calls[0][0];
    expect(persisted.answers.every((a: { scoringMethod: string }) => a.scoringMethod === 'client-key-deterministic')).toBe(true);
    expect(mocks.createMistakeIfAbsent).not.toHaveBeenCalled();
    expect(mocks.recordPracticeSessionMasteryOnce).not.toHaveBeenCalled();
  });
});
