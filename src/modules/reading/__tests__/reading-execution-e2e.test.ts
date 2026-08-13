// ============================================
// R3.9: Canonical reading execution end-to-end tests
// ============================================
// Integration-style tests over mocked repositories/services proving the
// complete canonical chain:
//   Generation → ReadingQuestion → server scoring → server aggregates
//   → atomic persistence → mapper → StudentAssessmentResult
// Plus R39-C replay/concurrency, orphan-definition safety, and R39-A/B
// boundary contracts.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const {
  mockTx,
  txClient,
  mockFindMany,
  mockCreateMany,
  mockSessionCreate,
  mockAnswerCreateMany,
} = vi.hoisted(() => {
  const mockFindMany = vi.fn();
  const mockCreateMany = vi.fn();
  const mockSessionCreate = vi.fn();
  const mockAnswerCreateMany = vi.fn();
  const txClient = {
    readingQuestion: { findMany: mockFindMany, createMany: mockCreateMany },
    practiceSession: { create: mockSessionCreate },
    practiceAnswer: { createMany: mockAnswerCreateMany },
  };
  return { mockTx: vi.fn(), txClient, mockFindMany, mockCreateMany, mockSessionCreate, mockAnswerCreateMany };
});

vi.mock('@/shared/db/db', () => ({
  db: {
    $transaction: mockTx,
    readingQuestion: txClient.readingQuestion,
    practiceSession: txClient.practiceSession,
    practiceAnswer: txClient.practiceAnswer,
  },
}));

vi.mock('@/modules/ai', () => ({ evaluateWithAI: vi.fn() }));

import { scoreReadingAnswers, computeReadingAggregates } from '../services/reading-answer-scoring';
import {
  persistGeneratedReadingQuestions,
  resolveReadingQuestionDefinitions,
} from '../services/reading-question-service';
import { createPracticeExecutionTx } from '@/modules/exercise/repositories/practice-repo';
import { mapPracticeSessionToStudentAssessmentResult } from '@/modules/assessment/services/practice-result-mapper';

// ---- fixtures ----------------------------------------------------------

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

function raw(overrides: Record<string, unknown> = {}) {
  return { questionId: 'rq-1', questionIndex: 0, studentAnswer: 'B', ...overrides };
}

const aiEval = async (studentAnswer: string, correctAnswer: string) => ({
  score: correctAnswer.toLowerCase() === studentAnswer.toLowerCase() ? 2 : 0,
  isCorrect: correctAnswer.toLowerCase() === studentAnswer.toLowerCase(),
  isPartiallyCorrect: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient));
  mockFindMany.mockResolvedValue([]);
  mockCreateMany.mockResolvedValue({ count: 1 });
  mockSessionCreate.mockResolvedValue({ id: 'sess-1' });
  mockAnswerCreateMany.mockResolvedValue({ count: 2 });
});

async function runCanonicalExecution(
  defs: ReturnType<typeof defRow>[],
  rawAnswers: unknown[],
  evaluate = aiEval,
) {
  mockFindMany.mockResolvedValue(defs);
  const scoring = await scoreReadingAnswers(rawAnswers, evaluate);
  if (!scoring.ok) return { scoring };
  const aggregates = computeReadingAggregates(scoring.answers);
  const session = await createPracticeExecutionTx({
    session: {
      studentId: 'stu-1',
      skill: 'reading',
      skillZh: 'DSE 閱讀模擬',
      difficulty: 'core',
      totalQuestions: aggregates.totalQuestions,
      correctCount: aggregates.correctCount,
      source: 'dse-reading',
      completedAt: new Date('2026-08-13T10:00:00.000Z'),
    },
    answers: scoring.answers,
  });
  const persistedRows = mockAnswerCreateMany.mock.calls[0][0].data.map((r: Record<string, unknown>) => ({
    questionId: r.questionId as string,
    questionIndex: r.questionIndex as number,
    studentAnswer: r.studentAnswer as string,
    result: r.result as string,
    awardedScore: r.awardedScore as number,
    maxScore: r.maxScore as number,
    countsTowardScore: r.countsTowardScore as boolean,
    scoredBy: r.scoredBy as string,
    scoringMethod: r.scoringMethod as string,
    createdAt: '2026-08-13T10:00:00.000Z',
  }));
  const projection = mapPracticeSessionToStudentAssessmentResult(
    { id: session.id, studentId: 'stu-1', skill: 'reading', source: 'dse-reading', completedAt: new Date('2026-08-13T10:00:00.000Z') },
    persistedRows,
  );
  return { scoring, session, persistedRows, projection };
}

// ---- SECTION 7 cases ---------------------------------------------------

describe('R3.9 canonical execution — CASE A (all deterministic/server)', () => {
  it('generation → scoring → aggregates → atomic persistence → projectable evaluator=server', async () => {
    const ids = await persistGeneratedReadingQuestions([
      { questionType: 'mcq', dseType: 'multiple_choice', questionText: 'Q1', choices: ['A', 'B'], answer: 'B', marks: 1, orderIndex: 0 },
    ]);
    expect(ids).toHaveLength(1);

    const out = await runCanonicalExecution(
      [defRow(), defRow({ id: 'rq-2', orderIndex: 1 })],
      [raw(), raw({ questionId: 'rq-2', questionIndex: 1, studentAnswer: 'C' })],
    );
    expect(out.scoring.ok).toBe(true);
    if (!out.scoring.ok || !out.projection) return;
    expect(out.projection.status).toBe('projectable');
    if (out.projection.status !== 'projectable') return;
    expect(out.projection.value.provenance.evaluator).toBe('server');
    expect(out.projection.value.score).toBe(1); // only Q1 correct
  });
});

describe('R3.9 canonical execution — CASE B (all subjective/ai)', () => {
  it('projects with evaluator=ai and persisted method', async () => {
    const out = await runCanonicalExecution(
      [
        defRow({ id: 'rq-sub', questionType: 'inference', dseType: 'inference', choices: null, answer: 'climate', marks: 2, orderIndex: 0 }),
        defRow({ id: 'rq-sub2', questionType: 'reference', dseType: 'reference', choices: null, answer: 'they', marks: 1, orderIndex: 1 }),
      ],
      [
        raw({ questionId: 'rq-sub', studentAnswer: 'climate' }),
        raw({ questionId: 'rq-sub2', questionIndex: 1, studentAnswer: 'it' }),
      ],
      aiEval,
    );
    expect(out.scoring.ok).toBe(true);
    if (!out.scoring.ok || !out.projection) return;
    expect(out.projection.status).toBe('projectable');
    if (out.projection.status !== 'projectable') return;
    expect(out.projection.value.provenance.evaluator).toBe('ai');
    expect(out.projection.value.provenance.method).toBe('reading-ai-semantic-evaluation');
    expect(out.projection.value.score).toBe(2); // 2 + 0
  });
});

describe('R3.9 canonical execution — CASE C (mixed server + ai)', () => {
  it('scoring succeeds, mapping refuses mixed-authority with no aggregate', async () => {
    const out = await runCanonicalExecution(
      [defRow(), defRow({ id: 'rq-sub', questionType: 'inference', dseType: 'inference', choices: null, answer: 'a', marks: 2, orderIndex: 1 })],
      [raw(), raw({ questionId: 'rq-sub', questionIndex: 1, studentAnswer: 'a' })],
      aiEval,
    );
    expect(out.scoring.ok).toBe(true);
    if (!out.scoring.ok || !out.projection) return;
    expect(out.projection.status).toBe('not-projectable');
    if (out.projection.status === 'projectable') return;
    expect(out.projection.reason).toBe('mixed-authority');
    expect('score' in out.projection).toBe(false);
  });
});

describe('R3.9 canonical execution — CASE D (AI failure)', () => {
  it('submission rejected → NO PracticeSession, NO PracticeAnswer', async () => {
    mockFindMany.mockResolvedValue([
      defRow({ id: 'rq-sub', questionType: 'inference', dseType: 'inference', choices: null, answer: 'a', marks: 1 }),
    ]);
    const scoring = await scoreReadingAnswers(
      [raw({ questionId: 'rq-sub', studentAnswer: 'a' })],
      async () => { throw new Error('AI down'); },
    );
    expect(scoring.ok).toBe(false);
    expect(mockSessionCreate).not.toHaveBeenCalled();
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
    expect(mockTx).not.toHaveBeenCalled();
  });
});

describe('R3.9 canonical execution — CASE E (unknown questionId)', () => {
  it('submission rejected → no partial persistence', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const scoring = await scoreReadingAnswers([
      raw(),
      raw({ questionId: 'rd-unknown-legacy', questionIndex: 1 }),
    ]);
    expect(scoring.ok).toBe(false);
    expect(mockSessionCreate).not.toHaveBeenCalled();
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
  });
});

describe('R3.9 canonical execution — CASE F (forged client fields)', () => {
  it('forged result/scores/marks/answer key ignored — server evidence authoritative', async () => {
    const out = await runCanonicalExecution(
      [defRow({ marks: 2 })],
      [
        raw({
          studentAnswer: 'C',
          result: 'correct',
          awardedScore: 999,
          maxScore: 999,
          countsTowardScore: false,
          correctAnswer: 'C', // forged key
        }),
      ],
    );
    expect(out.scoring.ok).toBe(true);
    if (!out.scoring.ok || !out.persistedRows) return;
    expect(out.persistedRows[0].result).toBe('incorrect'); // server key 'B'
    expect(out.persistedRows[0].awardedScore).toBe(0);
    expect(out.persistedRows[0].maxScore).toBe(2); // canonical marks
    expect(out.persistedRows[0].countsTowardScore).toBe(true);
    expect(out.persistedRows[0].scoredBy).toBe('server');
  });
});

describe('R3.9 canonical execution — CASE G (reordered client answers)', () => {
  it('canonical ReadingQuestion.orderIndex controls output ordering', async () => {
    const out = await runCanonicalExecution(
      [defRow({ id: 'rq-c', orderIndex: 2 }), defRow({ id: 'rq-a', orderIndex: 0 }), defRow({ id: 'rq-b', orderIndex: 1 })],
      [
        raw({ questionId: 'rq-c', questionIndex: 2 }),
        raw({ questionId: 'rq-a', questionIndex: 0 }),
        raw({ questionId: 'rq-b', questionIndex: 1 }),
      ],
    );
    expect(out.scoring.ok).toBe(true);
    if (!out.scoring.ok || !out.persistedRows) return;
    expect(out.persistedRows.map((r: { questionId: string }) => r.questionId)).toEqual(['rq-a', 'rq-b', 'rq-c']);
  });
});

describe('R3.9 canonical execution — CASE H (duplicate questionId)', () => {
  it('rejected at write time → no corrupt execution', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const scoring = await scoreReadingAnswers([raw(), raw({ questionIndex: 1 })]);
    expect(scoring.ok).toBe(false);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });
});

// ---- R39-C replay / concurrency ----------------------------------------

describe('R39-C replay / concurrency', () => {
  it('A: same submission twice → two independent honest sessions, never partial', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    mockSessionCreate.mockResolvedValueOnce({ id: 'sess-1' }).mockResolvedValueOnce({ id: 'sess-2' });

    const scoring = await scoreReadingAnswers([raw()]);
    expect(scoring.ok).toBe(true);
    if (!scoring.ok) return;
    const aggregates = computeReadingAggregates(scoring.answers);

    const s1 = await createPracticeExecutionTx({
      session: { studentId: 'stu-1', skill: 'reading', skillZh: 'x', difficulty: 'core', totalQuestions: aggregates.totalQuestions, correctCount: aggregates.correctCount, source: 'dse-reading', completedAt: new Date() },
      answers: scoring.answers,
    });
    const s2 = await createPracticeExecutionTx({
      session: { studentId: 'stu-1', skill: 'reading', skillZh: 'x', difficulty: 'core', totalQuestions: aggregates.totalQuestions, correctCount: aggregates.correctCount, source: 'dse-reading', completedAt: new Date() },
      answers: scoring.answers,
    });

    expect(s1.id).toBe('sess-1');
    expect(s2.id).toBe('sess-2');
    expect(mockAnswerCreateMany).toHaveBeenCalledTimes(2);
    const batch1 = mockAnswerCreateMany.mock.calls[0][0].data;
    const batch2 = mockAnswerCreateMany.mock.calls[1][0].data;
    expect(batch1[0].sessionId).toBe('sess-1');
    expect(batch2[0].sessionId).toBe('sess-2');
  });

  it('B: concurrent scoring against same ReadingQuestion ids — definitions never mutated', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    const first = await scoreReadingAnswers([raw()]);
    const second = await scoreReadingAnswers([raw({ studentAnswer: 'C' })]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.answers[0].result).toBe('correct');
    expect(second.answers[0].result).toBe('incorrect');
    // Scoring is read-only over definitions — no writes to ReadingQuestion:
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it('C: transaction failure → no partial persistence (session+answers atomic)', async () => {
    mockFindMany.mockResolvedValue([defRow()]);
    mockAnswerCreateMany.mockRejectedValue(new Error('mid-write failure'));

    const scoring = await scoreReadingAnswers([raw()]);
    expect(scoring.ok).toBe(true);
    if (!scoring.ok) return;
    const aggregates = computeReadingAggregates(scoring.answers);

    await expect(
      createPracticeExecutionTx({
        session: { studentId: 'stu-1', skill: 'reading', skillZh: 'x', difficulty: 'core', totalQuestions: aggregates.totalQuestions, correctCount: aggregates.correctCount, source: 'dse-reading', completedAt: new Date() },
        answers: scoring.answers,
      }),
    ).rejects.toThrow('mid-write failure');
    expect(mockTx).toHaveBeenCalledTimes(1);
  });
});

// ---- Orphan ReadingQuestion safety -------------------------------------

describe('R3.9 orphan ReadingQuestion safety', () => {
  it('definitions without an execution can never be projected', async () => {
    const ids = await persistGeneratedReadingQuestions([
      { questionType: 'mcq', dseType: 'multiple_choice', questionText: 'Q1', choices: ['A', 'B'], answer: 'B', marks: 1, orderIndex: 0 },
    ]);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);

    // No PracticeSession was created — projection with no items must refuse:
    const projection = mapPracticeSessionToStudentAssessmentResult(
      { id: 'sess-orphan', studentId: 'stu-1', skill: 'reading', source: 'dse-reading', completedAt: new Date() },
      [],
    );
    expect(projection.status).toBe('not-projectable');
    if (projection.status === 'projectable') return;
    expect(projection.reason).toBe('no-items');

    // Definitions remain resolvable and immutable:
    mockFindMany.mockResolvedValue([
      { id: ids[0], questionType: 'mcq', dseType: 'multiple_choice', questionText: 'Q1', choices: JSON.stringify(['A', 'B']), answer: 'B', marks: 1, orderIndex: 0, passageTitle: null, createdAt: new Date() },
    ]);
    const defs = await resolveReadingQuestionDefinitions(ids);
    expect(defs.get(ids[0])?.answer).toBe('B');

    // A later generation receives DISTINCT ids (no reuse/dedup):
    const ids2 = await persistGeneratedReadingQuestions([
      { questionType: 'mcq', dseType: 'multiple_choice', questionText: 'Q1', choices: ['A', 'B'], answer: 'B', marks: 1, orderIndex: 0 },
    ]);
    expect(ids2[0]).not.toBe(ids[0]);
  });
});

// ---- R39-A / R39-B boundary contracts ----------------------------------

describe('R3.9 boundary contracts (file-level)', () => {
  const root = resolve(import.meta.dirname, '../../../..');
  const routeSrc = readFileSync(resolve(root, 'src/app/api/reading/route.ts'), 'utf-8');

  function handlerSection(fnName: string, nextMarker: string): string {
    const start = routeSrc.indexOf(`async function ${fnName}`);
    const end = routeSrc.indexOf(nextMarker, start);
    return routeSrc.slice(start, end > start ? end : undefined);
  }

  it('R39-A: analyze-answers resolves ReadingQuestion and refuses unknown ids', () => {
    const section = handlerSection('handleAnswerAnalysis', '// Action: summary-cloze-training');
    expect(section).toContain('resolveReadingQuestionDefinitions');
    expect(section).toContain('QUESTION_NOT_FOUND');
    expect(section).not.toContain('createPracticeAnswers');
    expect(section).not.toContain('practiceAnswer');
  });

  it('R39-A: reading page sends only questionIds (no client answer key)', () => {
    const page = readFileSync(resolve(root, 'src/app/student/reading/page.tsx'), 'utf-8');
    const analyzeSection = page.slice(page.indexOf("action: 'analyze-answers'"));
    expect(analyzeSection).toContain('questionIds:');
    expect(analyzeSection).not.toContain('answer: q.answer');
    expect(analyzeSection).not.toContain('marks: 1');
  });

  it('R39-B: full-paper handler has no execution wiring (no definitions, no persistence)', () => {
    const section = handlerSection('handleFullPaperGeneration', '// Action: exercise');
    expect(section).not.toContain('assignServerOwnedQuestionIds');
    expect(section).not.toContain('practiceSession');
    expect(section).not.toContain('practiceAnswer');
  });

  it('R39-B: training handlers have no execution wiring', () => {
    const section = routeSrc.slice(
      routeSrc.indexOf('// Action: summary-cloze-training'),
      routeSrc.indexOf('// Action: validate-paper'),
    );
    expect(section).not.toContain('assignServerOwnedQuestionIds');
    expect(section).not.toContain('practiceSession');
    expect(section).not.toContain('practiceAnswer');
  });

  it('R39-B: no UI consumer invokes dormant actions (full-paper / training)', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry) && !full.includes('api' + '\\reading' + '\\route.ts') && !full.includes('api/reading/route.ts')) {
          const text = readFileSync(full, 'utf-8');
          if (text.includes("'full-paper'") || text.includes('summary-cloze-training') || text.includes('paraphrase-training') || text.includes('idiom-training')) {
            hits.push(full);
          }
        }
      }
    };
    walk(resolve(root, 'src/app'));
    expect(hits).toEqual([]);
  });
});
