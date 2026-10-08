// ============================================
// IELTS Attempt Service — server-authoritative scoring tests
// ============================================
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAttemptById: vi.fn(),
  findAttemptWithResponses: vi.fn(),
  findLatestAttemptForTest: vi.fn(),
  getTestForAttempt: vi.fn(),
  findQuestionsByIds: vi.fn(),
  createResponses: vi.fn(),
  markAttemptSubmitted: vi.fn(),
  createAttempt: vi.fn(),
  getTestById: vi.fn(),
  listSectionsForTest: vi.fn(),
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  findAttemptById: mocks.findAttemptById,
  findAttemptWithResponses: mocks.findAttemptWithResponses,
  findLatestAttemptForTest: mocks.findLatestAttemptForTest,
  getTestForAttempt: mocks.getTestForAttempt,
  findQuestionsByIds: mocks.findQuestionsByIds,
  createResponses: mocks.createResponses,
  markAttemptSubmitted: mocks.markAttemptSubmitted,
  createAttempt: mocks.createAttempt,
  getTestById: mocks.getTestById,
  listSectionsForTest: mocks.listSectionsForTest,
}));

import { startIeltsAttempt, submitIeltsAttempt, getIeltsAttemptDetail } from '../services/attempt-service';

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
  // No prior attempt by default — resuming/restoring is opt-in per test.
  mocks.findLatestAttemptForTest.mockResolvedValue(null);
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

// 2026-10-04 reload safety: a page load must not mint a second attempt, and a
// submitted attempt must stay readable instead of being silently replaced.
describe('startIeltsAttempt — reload safety (resume / restore)', () => {
  beforeEach(() => {
    mocks.getTestById.mockResolvedValue({ id: 'test-1', status: 'PUBLISHED', skill: 'READING', testType: 'ACADEMIC' });
    mocks.createAttempt.mockResolvedValue(attemptRow({ id: 'attempt-new' }));
  });

  it('resumes the existing unfinished attempt instead of creating another', async () => {
    mocks.findLatestAttemptForTest.mockResolvedValue(
      attemptRow({ id: 'attempt-open', status: 'IN_PROGRESS' }),
    );

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('attempt-open');
      expect(result.data.status).toBe('IN_PROGRESS');
    }
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it('returns a submitted attempt as-is (the client restores its result)', async () => {
    mocks.findLatestAttemptForTest.mockResolvedValue(
      attemptRow({ id: 'attempt-done', status: 'SUBMITTED', submittedAt: new Date(), rawScore: 3 }),
    );

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('attempt-done');
      expect(result.data.status).toBe('SUBMITTED');
    }
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it('ignores abandoned attempts (a fresh attempt is created)', async () => {
    mocks.findLatestAttemptForTest.mockResolvedValue(attemptRow({ status: 'ABANDONED' }));

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('attempt-new');
    expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
  });

  it('force=true starts a new attempt even when one exists (explicit retake)', async () => {
    mocks.findLatestAttemptForTest.mockResolvedValue(
      attemptRow({ id: 'attempt-done', status: 'SUBMITTED' }),
    );

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1', force: true });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('attempt-new');
    expect(mocks.findLatestAttemptForTest).not.toHaveBeenCalled();
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

// ============================================
// Listening transcript release (2026-10-08)
// ============================================
// The runner promised "the transcript is revealed after submission", but nothing
// delivered or rendered it: `getSectionTranscriptForDelivery()` existed yet was only
// wired to the TTS audio route. The reveal now travels with the submitted result,
// gated on the attempt being SUBMITTED (pre-answer delivery would hand over answers).
describe('listening transcript release', () => {
  const LISTENING_SECTIONS = [
    { id: 'sec-1', orderIndex: 0, label: 'Part 1', transcriptText: 'Man: The tour starts at ten.' },
    { id: 'sec-2', orderIndex: 1, label: 'Part 2', transcriptText: 'Woman: Welcome to the garden.' },
  ];

  function listeningTest() {
    return {
      ...publishedTest(['q-1']),
      skill: 'LISTENING',
      sections: LISTENING_SECTIONS,
    };
  }

  it('releases every section transcript together with the submitted result', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow({ skill: 'LISTENING' }));
    mocks.getTestById.mockResolvedValue({
      id: 'test-1',
      status: 'PUBLISHED',
      origin: 'CATALOGUE',
      ownerUserId: null,
      skill: 'LISTENING',
      testType: 'ACADEMIC',
    });
    mocks.getTestForAttempt.mockResolvedValue(listeningTest());
    mocks.findQuestionsByIds.mockResolvedValue([
      questionRow({ questionType: 'listening_multiple_choice', answerKey: JSON.stringify('B') }),
    ]);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcripts).toEqual([
      { sectionId: 'sec-1', label: 'Part 1', orderIndex: 0, transcript: 'Man: The tour starts at ten.' },
      { sectionId: 'sec-2', label: 'Part 2', orderIndex: 1, transcript: 'Woman: Welcome to the garden.' },
    ]);
  });

  it('omits empty transcripts and reports [] when the test has none', async () => {
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue({
      ...publishedTest(['q-1']),
      sections: [{ id: 'sec-1', orderIndex: 0, label: 'Section 1', transcriptText: '   ' }],
    });
    mocks.findQuestionsByIds.mockResolvedValue([questionRow()]);

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcripts).toEqual([]);
  });

  it('keeps transcripts hidden while the attempt is still in progress', async () => {
    mocks.findAttemptWithResponses.mockResolvedValue({
      ...attemptRow({ status: 'IN_PROGRESS', skill: 'LISTENING' }),
      responses: [],
    });

    const detail = await getIeltsAttemptDetail('attempt-1');

    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.transcripts).toEqual([]);
    // Never even read the section text for an open attempt.
    expect(mocks.listSectionsForTest).not.toHaveBeenCalled();
  });

  it('reveals transcripts when re-reading a SUBMITTED attempt (refresh safety)', async () => {
    mocks.findAttemptWithResponses.mockResolvedValue({
      ...attemptRow({ status: 'SUBMITTED', skill: 'LISTENING', submittedAt: new Date() }),
      responses: [
        {
          questionId: 'q-1',
          rawAnswer: 'B',
          verdict: 'correct',
          scoringDetail: JSON.stringify({ reason: 'MC_LETTER_MATCH' }),
          answeredAt: new Date(),
        },
      ],
    });
    mocks.findQuestionsByIds.mockResolvedValue([
      questionRow({ questionType: 'listening_multiple_choice' }),
    ]);
    mocks.listSectionsForTest.mockResolvedValue(LISTENING_SECTIONS);

    const detail = await getIeltsAttemptDetail('attempt-1');

    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.transcripts).toHaveLength(2);
    expect(detail.data.transcripts[0].transcript).toContain('tour starts at ten');
    expect(mocks.listSectionsForTest).toHaveBeenCalledWith('test-1');
  });
});
