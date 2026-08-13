// ============================================
// R3.2 Re-Audit: PracticeAnswer Persistence Mapping Tests
// ============================================
// Repository-mapping integration tests with a MOCKED Prisma layer.
//
// HONESTY NOTE: these tests prove the repository maps the normalized
// answers 1:1 into the Prisma payload (no transformation, no identity
// rewriting). They do NOT prove a real database round trip — that
// requires the live PostgreSQL/Neon instance, which is unreachable
// from this environment (verified: prisma migrate status → P1001).
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateMany } = vi.hoisted(() => ({
  mockCreateMany: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    practiceAnswer: { createMany: mockCreateMany },
  },
}));

import { createPracticeAnswers } from '../repositories/practice-repo';
import { validatePracticeAnswers } from '../services/practice-answer-validation';

beforeEach(() => {
  mockCreateMany.mockReset();
  mockCreateMany.mockResolvedValue({ count: 1 });
});

// ============================================
// GATE 8 — questionId round trip (repo mapping)
// ============================================

describe('GATE 8 — questionId persistence mapping', () => {
  it('persists canonical questionId verbatim; questionIndex stays ordering-only', async () => {
    const validation = validatePracticeAnswers([
      { questionId: 'q-real-123', questionIndex: 0, studentAnswer: 'A', correctAnswer: 'A' },
    ]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    await createPracticeAnswers('session-1', validation.answers);

    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const data = mockCreateMany.mock.calls[0][0].data[0];
    expect(data.questionId).toBe('q-real-123');
    expect(data.questionIndex).toBe(0);
    // Identity is NOT derived from sessionId/questionIndex:
    expect(data.questionId).not.toBe('session-1-q0');
  });

  it('two answers with the same index keep their distinct questionIds', async () => {
    const validation = validatePracticeAnswers([
      { questionId: 'q-a', questionIndex: 2, studentAnswer: 'A', correctAnswer: 'A' },
      { questionId: 'q-b', questionIndex: 2, studentAnswer: 'C', correctAnswer: 'C' },
    ]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    await createPracticeAnswers('session-1', validation.answers);

    const data = mockCreateMany.mock.calls[0][0].data;
    expect(data.map((d: { questionId: string }) => d.questionId)).toEqual(['q-a', 'q-b']);
    expect(data[0].questionIndex).toBe(2);
    expect(data[1].questionIndex).toBe(2);
  });
});

// ============================================
// R3.3 — authority evidence is persisted per row
// ============================================

describe('R3.3 — scoredBy / scoringMethod persistence', () => {
  it('server-scored practice answer persists scoredBy=server + method', async () => {
    const validation = validatePracticeAnswers([
      { questionId: 'q-s1', questionIndex: 0, studentAnswer: 'C', correctAnswer: 'B', isCorrect: true },
    ]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    await createPracticeAnswers('session-1', validation.answers);

    const data = mockCreateMany.mock.calls[0][0].data[0];
    expect(data.scoredBy).toBe('server');
    expect(data.scoringMethod).toBe('client-key-deterministic');
    expect(data.result).toBe('incorrect'); // forged isCorrect ignored
  });

  it('deferred reading answer is rejected — no scoredBy=client rows can persist (R3.7)', async () => {
    const validation = validatePracticeAnswers([
      {
        questionId: 'reading-q1', questionIndex: 0, dseType: 'multiple_choice',
        studentAnswer: 'some answer', correctAnswer: 'expected answer', isCorrect: false,
        result: 'partial', awardedScore: 2, maxScore: 3, countsTowardScore: true,
      },
    ]);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error).toContain('伺服器評分');

    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});

// ============================================
// GATE 9 — reading partial credit round trip
// ============================================

describe('GATE 9 — reading client-scored rows rejected (R3.7 server authority)', () => {
  it('rejects the 2/3 partial reading row instead of persisting it', async () => {
    const validation = validatePracticeAnswers([
      {
        questionId: 'reading-q1',
        questionIndex: 0,
        dseType: 'multiple_choice',
        studentAnswer: 'some answer',
        correctAnswer: 'expected answer',
        isCorrect: false,
        result: 'partial',
        awardedScore: 2,
        maxScore: 3,
        countsTowardScore: true,
      },
    ]);
    expect(validation.ok).toBe(false);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('rejects fractional client-scored reading rows (1.5 / 4)', () => {
    const validation = validatePracticeAnswers([
      { questionId: 'reading-q2', questionIndex: 0, dseType: 'multiple_choice', result: 'partial', awardedScore: 1.5, maxScore: 4 },
    ]);
    expect(validation.ok).toBe(false);
  });
});

// ============================================
// GATE 4 — no maxScore inference
// ============================================

describe('GATE 4 — maxScore is never inferred', () => {
  it('rejects a reading result without maxScore (never writes maxScore=1)', async () => {
    const validation = validatePracticeAnswers([
      { questionId: 'reading-q3', questionIndex: 0, dseType: 'multiple_choice', result: 'partial', awardedScore: 0.5 },
    ]);
    expect(validation.ok).toBe(false);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('rejects a reading result without awardedScore', () => {
    const validation = validatePracticeAnswers([
      { questionId: 'reading-q4', questionIndex: 0, dseType: 'multiple_choice', result: 'partial', maxScore: 3 },
    ]);
    expect(validation.ok).toBe(false);
  });

  it('server-scored practice answers produce the documented binary representation', async () => {
    const validation = validatePracticeAnswers([
      { questionId: 'q-binary', questionIndex: 0, studentAnswer: 'C', correctAnswer: 'B', isCorrect: true },
    ]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    await createPracticeAnswers('session-1', validation.answers);

    const data = mockCreateMany.mock.calls[0][0].data[0];
    // Server computed from answer comparison — forged isCorrect=true ignored.
    expect(data.result).toBe('incorrect');
    expect(data.awardedScore).toBe(0);
    expect(data.maxScore).toBe(1);
  });
});

// ============================================
// No information loss
// ============================================

describe('No information loss through the persistence mapping', () => {
  it('legacy fields (prompt/type/timeSpent) are preserved alongside the new fields', async () => {
    const validation = validatePracticeAnswers([
      {
        questionId: 'q-full', questionIndex: 0, questionType: 'fill-blank',
        questionPrompt: 'He ___ (go) to school.', studentAnswer: 'goes',
        correctAnswer: 'goes', isCorrect: true, timeSpent: 20,
      },
    ]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    await createPracticeAnswers('session-1', validation.answers);

    const data = mockCreateMany.mock.calls[0][0].data[0];
    expect(data.questionType).toBe('fill-blank');
    expect(data.questionPrompt).toBe('He ___ (go) to school.');
    expect(data.studentAnswer).toBe('goes');
    expect(data.correctAnswer).toBe('goes');
    expect(data.timeSpent).toBe(20);
    expect(data.questionId).toBe('q-full');
  });

  it('empty answers produce NO Prisma write', async () => {
    const validation = validatePracticeAnswers([]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    await createPracticeAnswers('session-1', validation.answers);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
