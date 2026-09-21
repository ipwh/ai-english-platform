// ============================================
// 2026-09-21 ADR-045: Server-authoritative listening scoring tests
// ============================================
// 契約（與 reading-answer-scoring 一致）：
//   1. 只有 `listening-server-exact-match` 是聆聽的權威評分法。
//   2. 客戶端送來的 correctAnswer / isCorrect / awardedScore 一律忽略。
//   3. 任何題目 id 解析不到正典定義 → 整份 NOT_PROJECTABLE（不製造假判決）。
//   4. 輸出順序由伺服器 orderIndex 決定，永不依客戶端陣列順序。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockCreateMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreateMany: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    listeningQuestion: {
      findMany: mockFindMany,
      createMany: mockCreateMany,
    },
  },
}));

import {
  scoreListeningAnswers,
  computeListeningAggregates,
  LISTENING_SERVER_SCORING_METHOD,
} from '../services/listening-answer-scoring';
import {
  persistGeneratedListeningQuestions,
  resolveListeningQuestionDefinitions,
  isDeliverableListeningMc,
} from '../services/listening-question-service';

/** Stored canonical definition row (server-owned) */
function defRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lq-1',
    questionType: 'mc',
    listeningType: null,
    questionText: 'What time does the tour start?',
    choices: JSON.stringify(['At nine', 'At ten', 'At eleven']),
    answer: 'B',
    marks: 1,
    orderIndex: 0,
    dialogue: 'The tour starts at ten.',
    dialogueZh: null,
    createdAt: new Date('2026-09-21T00:00:00.000Z'),
    ...overrides,
  };
}

/** Raw client answer row (scoring fields are adversarial) */
function rawAnswer(overrides: Record<string, unknown> = {}) {
  return {
    questionId: 'lq-1',
    questionIndex: 0,
    studentAnswer: 'B',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockCreateMany.mockResolvedValue({ count: 1 });
});

describe('scoreListeningAnswers — server-owned key', () => {
  it('MC scored against the server key → scoredBy=server, method=listening-server-exact-match', async () => {
    mockFindMany.mockResolvedValue([defRow()]);

    const result = await scoreListeningAnswers([rawAnswer({ studentAnswer: 'B' })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0]).toMatchObject({
      result: 'correct',
      isCorrect: true,
      awardedScore: 1,
      maxScore: 1,
      countsTowardScore: true,
      scoredBy: 'server',
      scoringMethod: LISTENING_SERVER_SCORING_METHOD,
    });
  });

  it('wrong letter → incorrect with awardedScore 0', async () => {
    mockFindMany.mockResolvedValue([defRow()]);

    const result = await scoreListeningAnswers([rawAnswer({ studentAnswer: 'C' })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('incorrect');
    expect(result.answers[0].awardedScore).toBe(0);
  });

  it('accepts the choice TEXT as well as the letter (canonical scorer, not a second rule set)', async () => {
    mockFindMany.mockResolvedValue([defRow()]);

    const result = await scoreListeningAnswers([rawAnswer({ studentAnswer: 'At ten' })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('correct');
  });

  it('ignores a forged client key and forged verdicts (never trusted)', async () => {
    mockFindMany.mockResolvedValue([defRow()]);

    const result = await scoreListeningAnswers([
      rawAnswer({ studentAnswer: 'C', correctAnswer: 'C', isCorrect: true, awardedScore: 1, maxScore: 1, countsTowardScore: true }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].correctAnswer).toBe('B');
    expect(result.answers[0].result).toBe('incorrect');
    expect(result.answers[0].awardedScore).toBe(0);
  });

  it('derives maxScore and awardedScore from server marks (never client maxScore)', async () => {
    mockFindMany.mockResolvedValue([defRow({ marks: 3 })]);

    const result = await scoreListeningAnswers([rawAnswer({ studentAnswer: 'B', maxScore: 99 })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].maxScore).toBe(3);
    expect(result.answers[0].awardedScore).toBe(3);
  });

  it('orders rows by server orderIndex, never by client array order', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'lq-b', orderIndex: 1, answer: 'A' }),
      defRow({ id: 'lq-a', orderIndex: 0, answer: 'A' }),
    ]);

    const result = await scoreListeningAnswers([
      { questionId: 'lq-b', questionIndex: 0, studentAnswer: 'A' },
      { questionId: 'lq-a', questionIndex: 1, studentAnswer: 'A' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.map(a => a.questionId)).toEqual(['lq-a', 'lq-b']);
  });
});

describe('scoreListeningAnswers — NOT_PROJECTABLE (no fabricated verdicts)', () => {
  it('rejects when an id has no canonical definition (historical ai-* local ids)', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await scoreListeningAnswers([rawAnswer({ questionId: 'ai-1700000000-0' })]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NOT_PROJECTABLE');
  });

  it('rejects a partially resolvable submission (never scores a subset)', async () => {
    mockFindMany.mockResolvedValue([defRow({ id: 'lq-1' })]);

    const result = await scoreListeningAnswers([
      rawAnswer({ questionId: 'lq-1' }),
      rawAnswer({ questionId: 'lq-missing', questionIndex: 1 }),
    ]);

    expect(result.ok).toBe(false);
  });

  it('rejects invalid marks (0 or non-finite) instead of scoring 0/0', async () => {
    mockFindMany.mockResolvedValue([defRow({ marks: 0 })]);
    await expect(scoreListeningAnswers([rawAnswer()])).resolves.toMatchObject({ ok: false });

    mockFindMany.mockResolvedValue([defRow({ marks: Number.NaN })]);
    await expect(scoreListeningAnswers([rawAnswer()])).resolves.toMatchObject({ ok: false });
  });

  it('rejects open-ended question types (no single answer key → self-assessed only)', async () => {
    mockFindMany.mockResolvedValue([defRow({ questionType: 'note-completion' })]);

    const result = await scoreListeningAnswers([rawAnswer()]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NOT_PROJECTABLE');
  });

  it('rejects empty submissions and id-less rows', async () => {
    await expect(scoreListeningAnswers([])).resolves.toMatchObject({ ok: false });
    await expect(scoreListeningAnswers([{ questionIndex: 0, studentAnswer: 'B' }])).resolves.toMatchObject({ ok: false });
  });
});

describe('computeListeningAggregates', () => {
  it('counts only rows that count toward score', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'lq-1', orderIndex: 0, answer: 'B' }),
      defRow({ id: 'lq-2', orderIndex: 1, answer: 'A' }),
    ]);

    const result = await scoreListeningAnswers([
      { questionId: 'lq-1', questionIndex: 0, studentAnswer: 'B' },
      { questionId: 'lq-2', questionIndex: 1, studentAnswer: 'C' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeListeningAggregates(result.answers)).toEqual({ totalQuestions: 2, correctCount: 1 });
  });
});

describe('listening question persistence', () => {
  it('returns server-assigned ids in input order and persists the dialogue', async () => {
    const ids = await persistGeneratedListeningQuestions([
      { questionType: 'mc', questionText: 'Q1', choices: ['A', 'B'], answer: 'A', marks: 1, orderIndex: 0, dialogue: 'D1' },
      { questionType: 'mc', questionText: 'Q2', choices: ['A', 'B'], answer: 'B', marks: 1, orderIndex: 1, dialogue: 'D2' },
    ]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const data = mockCreateMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data.map(d => d.id)).toEqual(ids);
    expect(data[0]).toMatchObject({ questionText: 'Q1', answer: 'A', dialogue: 'D1', provenance: 'ai-generated' });
  });

  it('does nothing for an empty batch', async () => {
    await expect(persistGeneratedListeningQuestions([])).resolves.toEqual([]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('resolves stored rows into definitions and omits missing ids', async () => {
    mockFindMany.mockResolvedValue([defRow()]);

    const map = await resolveListeningQuestionDefinitions(['lq-1', 'lq-missing']);

    expect(map.size).toBe(1);
    expect(map.get('lq-1')).toMatchObject({ id: 'lq-1', answer: 'B', choices: ['At nine', 'At ten', 'At eleven'] });
    expect(map.has('lq-missing')).toBe(false);
  });
});

describe('isDeliverableListeningMc — 交付前唯一判準', () => {
  const mc = (overrides: Record<string, unknown> = {}) => ({
    type: 'mc',
    listeningContent: 'The tour starts at ten in the morning.',
    choices: ['At nine', 'At ten', 'At eleven'],
    answer: 'B',
    ...overrides,
  });

  it('accepts an MC whose key appears verbatim in the dialogue', () => {
    expect(isDeliverableListeningMc(mc())).toBe(true);
  });

  it('accepts a key given as the choice text, with or without an option prefix', () => {
    expect(isDeliverableListeningMc(mc({ answer: 'At ten' }))).toBe(true);
    expect(isDeliverableListeningMc(mc({ answer: 'B. At ten' }))).toBe(true);
  });

  it('rejects a key that is absent from the dialogue (ungradable → must not be delivered)', () => {
    expect(isDeliverableListeningMc(mc({ answer: 'At noon' }))).toBe(false);
    expect(isDeliverableListeningMc(mc({ listeningContent: 'The museum is closed.' }))).toBe(false);
  });

  it('matches on word boundaries (never substring hits)', () => {
    expect(isDeliverableListeningMc(mc({
      listeningContent: 'She likes art and music.',
      choices: ['art', 'start'],
      answer: 'B',
    }))).toBe(false);
  });

  it('rejects non-MC types, empty dialogues, too few choices and out-of-range letters', () => {
    expect(isDeliverableListeningMc(mc({ type: 'fill-blank' }))).toBe(false);
    expect(isDeliverableListeningMc(mc({ listeningContent: '   ' }))).toBe(false);
    expect(isDeliverableListeningMc(mc({ choices: ['only one'] }))).toBe(false);
    expect(isDeliverableListeningMc(mc({ answer: 'D' }))).toBe(false);
    expect(isDeliverableListeningMc(mc({ answer: '' }))).toBe(false);
  });
});
