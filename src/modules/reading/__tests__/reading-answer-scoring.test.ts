// ============================================
// R3.7: Server-authoritative reading scoring tests
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFindMany, mockCreateMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreateMany: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    readingQuestion: {
      findMany: mockFindMany,
      createMany: mockCreateMany,
    },
  },
}));

vi.mock('@/modules/ai', () => ({
  evaluateWithAI: vi.fn(),
}));

import { scoreReadingAnswers, computeReadingAggregates } from '../services/reading-answer-scoring';
import {
  persistGeneratedReadingQuestions,
  resolveReadingQuestionDefinitions,
} from '../services/reading-question-service';

/** Stored canonical definition row (server-owned) */
function defRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rq-1',
    questionType: 'mcq',
    dseType: 'multiple_choice',
    questionText: 'Choose the best answer.',
    choices: JSON.stringify(['Alpha', 'Beta', 'Gamma']),
    answer: 'B',
    marks: 1,
    orderIndex: 0,
    passageTitle: null,
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    ...overrides,
  };
}

/** Raw client answer row (scoring fields are adversarial) */
function rawAnswer(overrides: Record<string, unknown> = {}) {
  return {
    questionId: 'rq-1',
    questionIndex: 0,
    dseType: 'multiple_choice',
    studentAnswer: 'B',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockCreateMany.mockResolvedValue({ count: 1 });
});

// ============================================
// Deterministic server scoring
// ============================================

describe('R3.7 deterministic server scoring (evaluator=server)', () => {
  it('MC scored against the server-owned key → evaluator=server, method=reading-server-exact-match', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([rawAnswer({ studentAnswer: 'B' })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0]).toMatchObject({
      result: 'correct',
      awardedScore: 1,
      maxScore: 1,
      countsTowardScore: true,
      scoredBy: 'server',
      scoringMethod: 'reading-server-exact-match',
    });
    expect(result.answers[0].isCorrect).toBe(true);
  });

  it('wrong letter → incorrect with awardedScore 0 (from server key, not client)', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([rawAnswer({ studentAnswer: 'C' })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('incorrect');
    expect(result.answers[0].awardedScore).toBe(0);
  });

  it('TFNG abbreviation is normalized (NG → Not Given)', async () => {
    mockFindMany.mockResolvedValue([
      defRow({
        questionType: 'trueFalseNG',
        dseType: 'true_false_not_given',
        choices: JSON.stringify(['True', 'False', 'Not Given']),
        answer: 'Not Given',
      }),
    ]);
    const result = await scoreReadingAnswers([rawAnswer({ studentAnswer: 'NG' })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('correct');
    expect(result.answers[0].scoredBy).toBe('server');
  });

  it('sequencing compares normalized order strings', async () => {
    mockFindMany.mockResolvedValue([
      defRow({
        id: 'rq-seq',
        questionType: 'sequencing',
        dseType: 'sentence_transformation',
        choices: null,
        questionText: 'Arrange the following events in the correct order.',
        answer: 'A, B, C',
      }),
    ]);
    const wrong = await scoreReadingAnswers([rawAnswer({ questionId: 'rq-seq', studentAnswer: 'a, c, b' })]);
    expect(wrong.ok).toBe(true);
    if (!wrong.ok) return;
    expect(wrong.answers[0].result).toBe('incorrect');

    const right = await scoreReadingAnswers([rawAnswer({ questionId: 'rq-seq', studentAnswer: 'A,B,C' })]);
    expect(right.ok).toBe(true);
    if (!right.ok) return;
    expect(right.answers[0].result).toBe('correct');
  });
});

// ============================================
// Forged client values are ignored
// ============================================

describe('R3.7 forged client values are ignored', () => {
  it('forged result=correct + awardedScore=999 + maxScore=999 are ignored', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([
      rawAnswer({
        studentAnswer: 'C',
        result: 'correct',
        awardedScore: 999,
        maxScore: 999,
        countsTowardScore: false,
      }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('incorrect');
    expect(result.answers[0].awardedScore).toBe(0);
    expect(result.answers[0].maxScore).toBe(1); // from canonical marks
    expect(result.answers[0].countsTowardScore).toBe(true);
  });

  it('forged client answer key (correctAnswer=WRONG) is ignored — server key decides', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([
      rawAnswer({ studentAnswer: 'B', correctAnswer: 'WRONG' }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('correct');
    expect(result.answers[0].correctAnswer).toBe('B'); // server-owned key
  });

  it('forged isCorrect=false on a correct answer is ignored', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([rawAnswer({ studentAnswer: 'B', isCorrect: false })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].isCorrect).toBe(true);
  });

  it('maxScore always comes from the canonical definition (marks=3)', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ dseType: 'inference', questionType: 'inference', marks: 3, choices: null, answer: 'full answer' }),
    ]);
    const result = await scoreReadingAnswers(
      [rawAnswer({ studentAnswer: 'something', maxScore: 1 })],
      async () => ({ score: 2, isCorrect: false, isPartiallyCorrect: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].maxScore).toBe(3); // NOT 1, NOT client 1
    expect(result.answers[0].awardedScore).toBe(2);
  });
});

// ============================================
// Subjective AI scoring (evaluator=ai)
// ============================================

describe('R3.7 server-AI subjective scoring (evaluator=ai)', () => {
  const evalStub = async (studentAnswer: string, correctAnswer: string) => ({
    score: correctAnswer.toLowerCase().includes(studentAnswer.toLowerCase()) ? 2 : 0,
    isCorrect: correctAnswer.toLowerCase().includes(studentAnswer.toLowerCase()),
    isPartiallyCorrect: false,
  });

  it('AI result persisted with evaluator=ai and binding evidence fields', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'rq-sub', dseType: 'inference', questionType: 'inference', choices: null, answer: 'climate change matters', marks: 2 }),
    ]);
    const result = await scoreReadingAnswers(
      [rawAnswer({ questionId: 'rq-sub', studentAnswer: 'climate change matters' })],
      evalStub,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0]).toMatchObject({
      questionId: 'rq-sub',
      studentAnswer: 'climate change matters',
      result: 'correct',
      awardedScore: 2,
      maxScore: 2,
      scoredBy: 'ai',
      scoringMethod: 'reading-ai-semantic-evaluation',
    });
  });

  it('partial AI result → result=partial with real awarded score', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'rq-sub', dseType: 'inference', questionType: 'inference', choices: null, answer: 'full', marks: 2 }),
    ]);
    const result = await scoreReadingAnswers(
      [rawAnswer({ questionId: 'rq-sub', studentAnswer: 'x' })],
      async () => ({ score: 1, isCorrect: false, isPartiallyCorrect: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[0].result).toBe('partial');
    expect(result.answers[0].awardedScore).toBe(1);
    expect(result.answers[0].scoredBy).toBe('ai');
  });

  it('AI failure for subjective item → NOT_PROJECTABLE, no fabricated server score (R37-H03)', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'rq-sub', dseType: 'inference', questionType: 'inference', choices: null, answer: 'exact', marks: 1 }),
    ]);
    const result = await scoreReadingAnswers(
      [rawAnswer({ questionId: 'rq-sub', studentAnswer: 'exact' })],
      async () => { throw new Error('AI down'); },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NOT_PROJECTABLE');
    expect(result.error).toContain('語意評估失敗');
  });

  it('mixed deterministic + subjective submission with AI failure → whole submission NOT_PROJECTABLE', async () => {
    mockFindMany.mockResolvedValue([
      defRow(),
      defRow({ id: 'rq-sub', dseType: 'inference', questionType: 'inference', choices: null, answer: 'a', marks: 1 }),
    ]);
    const result = await scoreReadingAnswers(
      [
        rawAnswer({ studentAnswer: 'B' }),
        rawAnswer({ questionId: 'rq-sub', studentAnswer: 'a' }),
      ],
      async () => { throw new Error('AI down'); },
    );
    expect(result.ok).toBe(false);
  });
});

// ============================================
// Provenance invariants
// ============================================

describe('R3.7 provenance invariants', () => {
  it('scoredBy is always server or ai — never client', async () => {
    mockFindMany.mockResolvedValue([
      defRow(),
      defRow({ id: 'rq-sub', dseType: 'inference', questionType: 'inference', choices: null, answer: 'a', marks: 1 }),
    ]);
    const result = await scoreReadingAnswers(
      [
        rawAnswer({ studentAnswer: 'B' }),
        rawAnswer({ questionId: 'rq-sub', studentAnswer: 'a' }),
      ],
      async () => ({ score: 1, isCorrect: true, isPartiallyCorrect: false }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const a of result.answers) {
      expect(['server', 'ai']).toContain(a.scoredBy);
      expect(a.scoredBy).not.toBe('client');
    }
    expect(result.answers[0].scoredBy).toBe('server');
    expect(result.answers[1].scoredBy).toBe('ai');
  });

  it('no evaluatorVersion field is produced anywhere', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([rawAnswer()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('evaluatorVersion' in result.answers[0]).toBe(false);
  });
});

// ============================================
// Identity + definition authority
// ============================================

describe('R3.7 question identity + definition authority', () => {
  it('historical/unresolvable questionId (rd-*) → NOT_PROJECTABLE', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await scoreReadingAnswers([rawAnswer({ questionId: 'rd-1720000000000-0' })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NOT_PROJECTABLE');
  });

  it('duplicate questionId within one submission is rejected', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const result = await scoreReadingAnswers([
      rawAnswer(),
      rawAnswer({ questionIndex: 1 }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('重複');
  });

  it('missing questionId is rejected', async () => {
    const result = await scoreReadingAnswers([rawAnswer({ questionId: undefined })]);
    expect(result.ok).toBe(false);
  });

  it('question with invalid marks (<=0) → NOT_PROJECTABLE, no invented maxScore', async () => {
    mockFindMany.mockResolvedValue([defRow({ marks: 0 })]);
    const result = await scoreReadingAnswers([rawAnswer()]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NOT_PROJECTABLE');
  });

  it('AI score outside 0..marks → NOT_PROJECTABLE (no clamping)', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'rq-sub', dseType: 'inference', questionType: 'inference', choices: null, answer: 'a', marks: 2 }),
    ]);
    const result = await scoreReadingAnswers(
      [rawAnswer({ questionId: 'rq-sub', studentAnswer: 'a' })],
      async () => ({ score: 5, isCorrect: true, isPartiallyCorrect: false }),
    );
    expect(result.ok).toBe(false);
  });

  it('empty answer list → ok with empty answers', async () => {
    const result = await scoreReadingAnswers([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers).toHaveLength(0);
  });
});

// ============================================
// Question store round trip
// ============================================

describe('R3.7 reading question store round trip', () => {
  it('persist then resolve returns the server-owned definition', async () => {
    const ids = await persistGeneratedReadingQuestions([
      {
        questionType: 'mcq',
        dseType: 'multiple_choice',
        questionText: 'Q1',
        choices: ['A', 'B', 'C'],
        answer: 'B',
        marks: 1,
        orderIndex: 0,
      },
    ]);
    expect(ids).toHaveLength(1);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);

    mockFindMany.mockResolvedValue([
      {
        id: ids[0],
        questionType: 'mcq',
        dseType: 'multiple_choice',
        questionText: 'Q1',
        choices: JSON.stringify(['A', 'B', 'C']),
        answer: 'B',
        marks: 1,
        orderIndex: 0,
        passageTitle: null,
        createdAt: new Date(),
      },
    ]);
    const defs = await resolveReadingQuestionDefinitions(ids);
    expect(defs.has(ids[0])).toBe(true);
    expect(defs.get(ids[0])?.answer).toBe('B');
    expect(defs.get(ids[0])?.choices).toEqual(['A', 'B', 'C']);
  });

  it('unresolvable id is simply absent from the map (never fabricated)', async () => {
    mockFindMany.mockResolvedValue([]);
    const defs = await resolveReadingQuestionDefinitions(['rd-unknown']);
    expect(defs.has('rd-unknown')).toBe(false);
  });
});

// ============================================
// Schema / migration / route contracts
// ============================================

describe('R3.7 schema and route contracts', () => {
  const root = resolve(import.meta.dirname, '../../../..');

  it('schema declares the ReadingQuestion model', () => {
    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf-8');
    expect(schema).toContain('model ReadingQuestion');
  });

  it('migration creates the ReadingQuestion table (additive)', () => {
    const sql = readFileSync(
      resolve(root, 'prisma/migrations/20260813_reading_question_store/migration.sql'),
      'utf-8',
    );
    expect(sql).toContain('CREATE TABLE "ReadingQuestion"');
  });

  it('reading generation route assigns server-owned ids via the question store', () => {
    const route = readFileSync(resolve(root, 'src/app/api/reading/route.ts'), 'utf-8');
    expect(route).toContain('assignServerOwnedQuestionIds');
    expect(route).toContain('persistGeneratedReadingQuestions');
  });

  it('practice submission service routes reading submissions through server scoring', () => {
    const svc = readFileSync(
      resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('scoreReadingAnswers');
    expect(svc).toContain('classifyPracticeSubmission({ source, skill, answers })');
    // reading marker detection lives in the canonical classifier:
    const classifier = readFileSync(
      resolve(root, 'src/modules/exercise/services/practice-submission-classification.ts'), 'utf-8');
    expect(classifier).toContain("input.source === 'dse-reading'");
  });

  it('practice submission service uses server-derived aggregates and atomic persistence for reading', () => {
    const svc = readFileSync(
      resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('computeReadingAggregates');
    expect(svc).toContain('createPracticeExecutionTx');
  });

  it('reading generation route never emits rd-* fallback ids (R37-H07)', () => {
    const route = readFileSync(resolve(root, 'src/app/api/reading/route.ts'), 'utf-8');
    expect(route).not.toContain('rd-${');
  });
});

// ============================================
// R37-H08: canonical ordering by orderIndex
// ============================================

describe('R37-H08 canonical ordering (server-owned orderIndex)', () => {
  it('output order follows orderIndex even when DB returns rows in different order', async () => {
    // Database insertion order deliberately differs from orderIndex:
    mockFindMany.mockResolvedValue([
      defRow({ id: 'rq-c', orderIndex: 2 }),
      defRow({ id: 'rq-a', orderIndex: 0 }),
      defRow({ id: 'rq-b', orderIndex: 1 }),
    ]);
    const result = await scoreReadingAnswers([
      rawAnswer({ questionId: 'rq-c', questionIndex: 2 }),
      rawAnswer({ questionId: 'rq-a', questionIndex: 0 }),
      rawAnswer({ questionId: 'rq-b', questionIndex: 1 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.map(a => a.questionId)).toEqual(['rq-a', 'rq-b', 'rq-c']);
  });
});

// ============================================
// R37-H01: server-authoritative session aggregates
// ============================================

describe('R37-H01 server-derived session aggregates', () => {
  const items = [
    { questionIndex: 0, questionId: 'q1', questionType: 'mcq', questionPrompt: '', correctAnswer: 'B', studentAnswer: 'B', isCorrect: true, result: 'correct' as const, awardedScore: 1, maxScore: 1, countsTowardScore: true, timeSpent: null, scoredBy: 'server' as const, scoringMethod: 'reading-server-exact-match' },
    { questionIndex: 1, questionId: 'q2', questionType: 'inference', questionPrompt: '', correctAnswer: 'x', studentAnswer: 'y', isCorrect: false, result: 'partial' as const, awardedScore: 1, maxScore: 3, countsTowardScore: true, timeSpent: null, scoredBy: 'ai' as const, scoringMethod: 'reading-ai-semantic-evaluation' },
    { questionIndex: 2, questionId: 'q3', questionType: 'mcq', questionPrompt: '', correctAnswer: 'C', studentAnswer: 'D', isCorrect: false, result: 'incorrect' as const, awardedScore: 0, maxScore: 1, countsTowardScore: true, timeSpent: null, scoredBy: 'server' as const, scoringMethod: 'reading-server-exact-match' },
  ];

  it('totalQuestions = number of canonical submitted items', () => {
    expect(computeReadingAggregates(items).totalQuestions).toBe(3);
  });

  it('totalScore = Σ item awardedScore', () => {
    expect(computeReadingAggregates(items).totalScore).toBe(2);
  });

  it('maxScore = Σ item maxScore', () => {
    expect(computeReadingAggregates(items).maxScore).toBe(5);
  });

  it('correctCount = count of result === correct only (partial NOT counted)', () => {
    expect(computeReadingAggregates(items).correctCount).toBe(1);
  });

  it('percentage = totalScore / maxScore', () => {
    expect(computeReadingAggregates(items).percentage).toBe(2 / 5);
  });

  it('aggregates are pure — client aggregate fields cannot influence them', () => {
    const forged = { ...items[0], totalScore: 999, correctCount: 999 } as never;
    const agg = computeReadingAggregates([forged] as never);
    expect(agg.totalScore).toBe(1);
    expect(agg.correctCount).toBe(1);
  });
});

// ============================================
// R37-H04: ReadingQuestion immutability
// ============================================

describe('R37-H04 ReadingQuestion immutability', () => {
  it('repository exposes NO update/delete/upsert path for ReadingQuestion', () => {
    const repo = readFileSync(resolve(import.meta.dirname, '../repositories/reading-question-repo.ts'), 'utf-8');
    expect(repo).not.toContain('readingQuestion.update');
    expect(repo).not.toContain('readingQuestion.delete');
    expect(repo).not.toContain('readingQuestion.upsert');
    expect(repo).not.toContain('readingQuestion.deleteMany');
  });

  it('service exposes NO mutation path for ReadingQuestion', () => {
    const service = readFileSync(resolve(import.meta.dirname, '../services/reading-question-service.ts'), 'utf-8');
    expect(service).not.toContain('update');
    expect(service).not.toContain('delete');
  });

  it('persisting the same content twice creates DISTINCT immutable definitions (new paper semantics)', async () => {
    const def = {
      questionType: 'mcq', dseType: 'multiple_choice', questionText: 'Q1',
      choices: ['A', 'B', 'C'], answer: 'B', marks: 1, orderIndex: 0,
    };
    const idsA = await persistGeneratedReadingQuestions([def]);
    const idsB = await persistGeneratedReadingQuestions([def]);
    expect(mockCreateMany).toHaveBeenCalledTimes(2);
    expect(idsA[0]).not.toBe(idsB[0]); // no dedup, no mutation of the first
  });
});
