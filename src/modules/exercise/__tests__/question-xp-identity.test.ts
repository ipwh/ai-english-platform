// ============================================
// 2026-10-01 稽核：answer XP 身分解析（難度 ＋ 內容指紋）
// ============================================
// 病根：`answerCorrect` 的去重鍵原本只用 `questionId`，而每次重新生成都會
// 以 `randomUUID()` 產生新 id → 同一題內容可重複領取 XP（DB 實測：同一內容
// 以 7 個不同 questionId 各領一次）。此外任意非空字串都能當 questionId
// （無需真實存在）→ 可腳本刷分。
// 契約：answer 事件必須解析到正典題目；指紋對選項洗牌與重新生成皆穩定；
// 查無此題 ⇒ null；查詢故障 ⇒ 往上拋（故障 ≠ 查無此題）。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveReadingQuestionDefinitions: vi.fn(),
  resolveListeningQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionDefinitions: vi.fn(),
}));

vi.mock('@/modules/reading/services/reading-question-service', () => ({
  resolveReadingQuestionDefinitions: mocks.resolveReadingQuestionDefinitions,
}));
vi.mock('@/modules/listening/services/listening-question-service', () => ({
  resolveListeningQuestionDefinitions: mocks.resolveListeningQuestionDefinitions,
}));
vi.mock('@/modules/exercise/services/grammar-question-service', () => ({
  resolveGrammarQuestionDefinitions: mocks.resolveGrammarQuestionDefinitions,
}));

import { resolveAnswerXpIdentity } from '../services/question-difficulty-resolution';

const grammarDef = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  questionType: 'mc',
  prompt: 'She ___ to school every day.',
  promptZh: null,
  choices: ['goes', 'go', 'going', 'gone'],
  answer: 'A',
  acceptedAnswers: null,
  grammarItem: 'tenses',
  languageSkill: null,
  difficulty: 'challenge',
  gradeLevel: 'S4',
  explanationZh: null,
  explanationEn: null,
  provenance: 'ai-generated',
  ...overrides,
});

const readingDef = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  questionType: 'mcq',
  dseType: 'multiple_choice',
  questionText: 'What is the main idea of the passage?',
  choices: ['A', 'B', 'C', 'D'].map((l, i) => `${l}. option ${i}`),
  answer: 'B',
  marks: 1,
  orderIndex: 0,
  ...overrides,
});

const listeningDef = (overrides: Record<string, unknown> = {}) => ({
  id: 'l1',
  questionType: 'mc',
  listeningType: null,
  questionText: 'What time will the party start?',
  choices: ['A. At 6 pm', 'B. At 7 pm', 'C. At 8 pm'],
  answer: 'B',
  marks: 1,
  orderIndex: 0,
  dialogue: 'A: The party starts at 7 pm. B: Great, see you there.',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveListeningQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map());
});

describe('resolveAnswerXpIdentity — 正典題目身分', () => {
  it('grammar：回傳正典難度與內容指紋', async () => {
    mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map([['g1', grammarDef()]]));

    const identity = await resolveAnswerXpIdentity('g1');

    expect(identity?.questionId).toBe('g1');
    expect(identity?.difficulty).toBe('challenge');
    expect(identity?.contentKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('指紋對選項洗牌穩定 —— 重新生成的新 id 不再重複發放（核心反刷分契約）', async () => {
    // 同內容、不同 id，且選項被洗牌（答案字母由 A 改為 D）
    mocks.resolveGrammarQuestionDefinitions
      .mockResolvedValueOnce(new Map([['g1', grammarDef()]]))
      .mockResolvedValueOnce(new Map([['g2', grammarDef({ id: 'g2', choices: ['gone', 'going', 'go', 'goes'], answer: 'D' })]]));

    const first = await resolveAnswerXpIdentity('g1');
    const regenerated = await resolveAnswerXpIdentity('g2');

    expect(first?.contentKey).toBe(regenerated?.contentKey);
    expect(first?.questionId).not.toBe(regenerated?.questionId);
  });

  it('不同內容 ⇒ 不同指紋（不得誤殺）', async () => {
    mocks.resolveGrammarQuestionDefinitions
      .mockResolvedValueOnce(new Map([['g1', grammarDef()]]))
      .mockResolvedValueOnce(new Map([['g2', grammarDef({ id: 'g2', prompt: 'They ___ football every Sunday.' })]]));

    const a = await resolveAnswerXpIdentity('g1');
    const b = await resolveAnswerXpIdentity('g2');

    expect(a?.contentKey).not.toBe(b?.contentKey);
  });

  it('reading：難度一律 core（schema 無 difficulty 欄位）', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([['r1', readingDef()]]));

    const identity = await resolveAnswerXpIdentity('r1');

    expect(identity?.difficulty).toBe('core');
    expect(identity?.contentKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('listening：對話不同 ⇒ 指紋不同（同一題目文字不得跨對話共用）', async () => {
    mocks.resolveListeningQuestionDefinitions
      .mockResolvedValueOnce(new Map([['l1', listeningDef()]]))
      .mockResolvedValueOnce(new Map([['l2', listeningDef({ id: 'l2', dialogue: 'A: The party starts at 8 pm. B: OK.' })]]));

    const a = await resolveAnswerXpIdentity('l1');
    const b = await resolveAnswerXpIdentity('l2');

    expect(a?.contentKey).not.toBe(b?.contentKey);
  });

  it('查無此題（任意字串）⇒ null —— 呼叫端必須拒絕發 XP', async () => {
    const identity = await resolveAnswerXpIdentity('not-a-real-question-id');
    expect(identity).toBeNull();
  });

  it('空白 id ⇒ null（不查詢）', async () => {
    expect(await resolveAnswerXpIdentity('   ')).toBeNull();
    expect(mocks.resolveGrammarQuestionDefinitions).not.toHaveBeenCalled();
  });

  it('查詢故障往上拋（故障 ≠ 查無此題，避免系統故障被誤判為拒絕）', async () => {
    mocks.resolveGrammarQuestionDefinitions.mockRejectedValue(new Error('db down'));

    await expect(resolveAnswerXpIdentity('g1')).rejects.toThrow('db down');
  });
});
