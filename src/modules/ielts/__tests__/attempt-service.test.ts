// ============================================
// IELTS Attempt Service — server-authoritative scoring tests
// ============================================
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAttemptById: vi.fn(),
  findAttemptWithResponses: vi.fn(),
  getTestForAttempt: vi.fn(),
  findQuestionsByIds: vi.fn(),
  createResponses: vi.fn(),
  markAttemptSubmitted: vi.fn(),
  createAttempt: vi.fn(),
  getTestById: vi.fn(),
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  findAttemptById: mocks.findAttemptById,
  findAttemptWithResponses: mocks.findAttemptWithResponses,
  getTestForAttempt: mocks.getTestForAttempt,
  findQuestionsByIds: mocks.findQuestionsByIds,
  createResponses: mocks.createResponses,
  markAttemptSubmitted: mocks.markAttemptSubmitted,
  createAttempt: mocks.createAttempt,
  getTestById: mocks.getTestById,
}));

import { startIeltsAttempt, submitIeltsAttempt } from '../services/attempt-service';

function questionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-1',
    testId: 'test-1',
    sectionId: 'sec-1',
    orderIndex: 0,
    questionType: 'reading_multiple_choice',
    skill: 'READING',
    prompt: 'Which one?',
    options: JSON.stringify(['Alpha', 'Beta', 'Gamma', 'Delta']),
    answerKey: JSON.stringify('B'),
    acceptedAnswers: null,
    wordLimit: null,
    evidence: null,
    explanation: 'Beta appears in paragraph 2.',
    difficulty: 'MEDIUM',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: JSON.stringify({ type: 'ORIGINAL_GENERATED' }),
    generatorVersion: 'v1',
    validationStatus: 'PUBLISHED',
    validationNotes: null,
    reviewedBy: 'teacher-1',
    reviewedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attempt-1',
    userId: 'student-1',
    testId: 'test-1',
    skill: 'READING',
    testType: 'ACADEMIC',
    status: 'IN_PROGRESS',
    startedAt: new Date(),
    submittedAt: null,
    rawScore: null,
    totalItems: null,
    bandEstimate: null,
    metadata: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function publishedTest(questionIds: string[]) {
  return {
    id: 'test-1',
    slug: 't1',
    title: 'Reading Practice',
    testType: 'ACADEMIC',
    skill: 'READING',
    status: 'PUBLISHED',
    sections: [],
    questions: questionIds.map((id) => ({ id })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createResponses.mockResolvedValue({ count: 1 });
  mocks.markAttemptSubmitted.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));
  // Default catalogue test (origin CATALOGUE, PUBLISHED) — instant tests override.
  mocks.getTestById.mockResolvedValue({
    id: 'test-1',
    status: 'PUBLISHED',
    origin: 'CATALOGUE',
    ownerUserId: null,
    skill: 'READING',
    testType: 'ACADEMIC',
  });
});

describe('startIeltsAttempt', () => {
  it('refuses unpublished tests', async () => {
    mocks.getTestById.mockResolvedValue({ id: 'test-1', status: 'QA_REQUIRED' });
    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('creates an attempt for a published test', async () => {
    mocks.getTestById.mockResolvedValue({ id: 'test-1', status: 'PUBLISHED', skill: 'READING', testType: 'ACADEMIC' });
    mocks.createAttempt.mockResolvedValue(attemptRow());
    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.userId).toBe('student-1');
  });
});

describe('submitIeltsAttempt — deterministic, server-authoritative', () => {
  it('scores against the canonical key; client correctness claims are not part of the contract', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue(publishedTest(['q-1']));
    mocks.findQuestionsByIds.mockResolvedValue([questionRow()]);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.correctCount).toBe(1);
      expect(result.data.results[0].verdict).toBe('correct');
      expect(result.data.results[0].correctAnswer).toBe('B');
      expect(result.data.results[0].explanation).toContain('paragraph 2');
    }
    expect(mocks.markAttemptSubmitted).toHaveBeenCalledTimes(1);
    const update = mocks.markAttemptSubmitted.mock.calls[0][1] as Record<string, unknown>;
    expect(update.rawScore).toBe(1);
  });

  it('rejects unknown/foreign question ids with 422', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue(publishedTest(['q-1']));
    mocks.findQuestionsByIds.mockResolvedValue([questionRow()]);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-FOREIGN', answer: 'B' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('UNKNOWN_QUESTION');
    }
  });

  it('rejects another user’s attempt (403)', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow({ userId: 'someone-else' }));
    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('refuses double submission (409)', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));
    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('derives a band-estimate RANGE for a full 40-question component', async () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      questionRow({ id: `q-${i}`, orderIndex: i }),
    );
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue(publishedTest(rows.map((r) => r.id)));
    mocks.findQuestionsByIds.mockResolvedValue(rows);

    const answers = rows.map((r) => ({ questionId: r.id, answer: 'B' }));
    const result = await submitIeltsAttempt({ userId: 'student-1', attemptId: 'attempt-1', answers });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rawScore).toBe(40);
      expect(result.data.bandEstimate?.estimate).toBe(true);
      expect(result.data.bandEstimate?.minBand).toBe(8);
      expect(result.data.bandEstimate?.displayRange).toBe('8.0+');
    }
  });

  it('reports NOT_COMPARABLE_SUBSET for a practice subset', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue(publishedTest(['q-1']));
    mocks.findQuestionsByIds.mockResolvedValue([questionRow()]);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bandEstimate).toBeNull();
      expect(result.data.notComparableReason).toContain('NOT_COMPARABLE_SUBSET');
    }
  });

  it('unanswered questions count as incorrect (blank = wrong) without response rows', async () => {
    const rows = [questionRow({ id: 'q-1' }), questionRow({ id: 'q-2', orderIndex: 1 })];
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue(publishedTest(['q-1', 'q-2']));
    mocks.findQuestionsByIds.mockResolvedValue(rows);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rawScore).toBe(1);
      expect(result.data.totalItems).toBe(2);
      expect(result.data.answeredCount).toBe(1);
    }
    // Only the answered question is persisted as a response row.
    const persisted = mocks.createResponses.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(1);
  });
});

describe('instant self-study attempts (2026-10-03 VII) — owner-only, never published', () => {
  it('starts an INSTANT set for its owner without publication', async () => {
    mocks.getTestById.mockResolvedValue({
      id: 'instant-1',
      status: 'DRAFT',
      origin: 'INSTANT',
      ownerUserId: 'student-1',
      skill: 'READING',
      testType: 'ACADEMIC',
    });
    mocks.createAttempt.mockResolvedValue(attemptRow({ testId: 'instant-1' }));

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'instant-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.testId).toBe('instant-1');
  });

  it('refuses another student’s INSTANT set (403)', async () => {
    mocks.getTestById.mockResolvedValue({
      id: 'instant-1',
      status: 'DRAFT',
      origin: 'INSTANT',
      ownerUserId: 'student-2',
      skill: 'READING',
      testType: 'ACADEMIC',
    });

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'instant-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it('refuses a withdrawn (REJECTED) INSTANT set even for its owner (403)', async () => {
    mocks.getTestById.mockResolvedValue({
      id: 'instant-1',
      status: 'REJECTED',
      origin: 'INSTANT',
      ownerUserId: 'student-1',
      skill: 'READING',
      testType: 'ACADEMIC',
    });

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'instant-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('scores an INSTANT attempt against QA_REQUIRED items (deterministic, server-side)', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow({ testId: 'instant-1' }));
    mocks.getTestById.mockResolvedValue({
      id: 'instant-1',
      status: 'DRAFT',
      origin: 'INSTANT',
      ownerUserId: 'student-1',
    });
    mocks.getTestForAttempt.mockResolvedValue({
      ...publishedTest(['q-1']),
      id: 'instant-1',
      status: 'DRAFT',
      origin: 'INSTANT',
    });
    mocks.findQuestionsByIds.mockResolvedValue([
      questionRow({ testId: 'instant-1', validationStatus: 'QA_REQUIRED' }),
    ]);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.correctCount).toBe(1);
    expect(mocks.getTestForAttempt).toHaveBeenCalledWith('instant-1', {
      questionStatuses: ['QA_REQUIRED', 'HUMAN_APPROVED', 'PUBLISHED'],
    });
  });

  it('never scores an INSTANT test for a non-owner attempt (404)', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow({ testId: 'instant-1', userId: 'student-1' }));
    mocks.getTestById.mockResolvedValue({
      id: 'instant-1',
      status: 'DRAFT',
      origin: 'INSTANT',
      ownerUserId: 'student-2',
    });

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(mocks.getTestForAttempt).not.toHaveBeenCalled();
  });
});
