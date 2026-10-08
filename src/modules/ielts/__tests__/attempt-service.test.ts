// ============================================
// IELTS Attempt Service — server-authoritative scoring tests
// ============================================
import { beforeEach, describe, expect, it, vi } from 'vitest';

const events = vi.hoisted(() => ({ emit: vi.fn() }));

const mocks = vi.hoisted(() => ({
  findAttemptById: vi.fn(),
  findAttemptWithResponses: vi.fn(),
  findLatestAttemptForTest: vi.fn(),
  findActiveAttemptForTest: vi.fn(),
  abandonActiveAttempts: vi.fn(),
  getTestForAttempt: vi.fn(),
  findQuestionsByIds: vi.fn(),
  finalizeAttemptSubmission: vi.fn(),
  createAttempt: vi.fn(),
  getTestById: vi.fn(),
  listSectionsForTest: vi.fn(),
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  findAttemptById: mocks.findAttemptById,
  findAttemptWithResponses: mocks.findAttemptWithResponses,
  findLatestAttemptForTest: mocks.findLatestAttemptForTest,
  findActiveAttemptForTest: mocks.findActiveAttemptForTest,
  abandonActiveAttempts: mocks.abandonActiveAttempts,
  getTestForAttempt: mocks.getTestForAttempt,
  findQuestionsByIds: mocks.findQuestionsByIds,
  finalizeAttemptSubmission: mocks.finalizeAttemptSubmission,
  createAttempt: mocks.createAttempt,
  getTestById: mocks.getTestById,
  listSectionsForTest: mocks.listSectionsForTest,
}));

// Observability sink — used to prove a LOSING concurrent submission emits no
// completion/answered events (exactly one logical finalisation).
vi.mock('../governance/events', () => ({ emitIeltsEvent: events.emit }));

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
  // The atomic finalisation wins the transition by default.
  mocks.finalizeAttemptSubmission.mockResolvedValue({ finalized: true });
  mocks.abandonActiveAttempts.mockResolvedValue({ count: 0 });
  mocks.findActiveAttemptForTest.mockResolvedValue(null);
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
    expect(mocks.finalizeAttemptSubmission).toHaveBeenCalledTimes(1);
    const call = mocks.finalizeAttemptSubmission.mock.calls[0][0] as {
      attemptId: string;
      userId: string;
      score: Record<string, unknown>;
    };
    expect(call.attemptId).toBe('attempt-1');
    expect(call.userId).toBe('student-1');
    expect(call.score.rawScore).toBe(1);
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
    // Only the answered question is persisted as a response row (inside the
    // same transaction as the status transition).
    const call = mocks.finalizeAttemptSubmission.mock.calls[0][0] as {
      responses: Array<Record<string, unknown>>;
    };
    expect(call.responses).toHaveLength(1);
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

// ============================================
// Concurrency invariants (2026-10-08, Sprint 131)
// ============================================
// These pin the APPLICATION-side contract of the DB-enforced guards. The
// database guarantees themselves (the unique `activeKey` index and the
// conditional IN_PROGRESS → SUBMITTED transition) are exercised against REAL
// PostgreSQL in `ielts-concurrency.integration.test.ts`.
describe('startIeltsAttempt — single active attempt per (student, test)', () => {
  beforeEach(() => {
    mocks.getTestById.mockResolvedValue({
      id: 'test-1',
      status: 'PUBLISHED',
      origin: 'CATALOGUE',
      ownerUserId: null,
      skill: 'READING',
      testType: 'ACADEMIC',
    });
  });

  it('stamps the active-attempt key so a duplicate INSERT is rejected by the DB', async () => {
    mocks.createAttempt.mockResolvedValue(attemptRow());

    await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });

    const data = mocks.createAttempt.mock.calls[0][0] as { activeKey?: string };
    expect(data.activeKey).toBe('student-1:test-1');
  });

  it('returns the concurrent winner when the INSERT loses the unique-key race', async () => {
    mocks.createAttempt.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    mocks.findActiveAttemptForTest.mockResolvedValue(attemptRow({ id: 'attempt-winner' }));

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('attempt-winner');
  });

  it('falls back to the latest attempt if the winner submitted in between', async () => {
    mocks.createAttempt.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    mocks.findActiveAttemptForTest.mockResolvedValue(null);
    mocks.findLatestAttemptForTest.mockResolvedValue(
      attemptRow({ id: 'attempt-done', status: 'SUBMITTED' }),
    );

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('attempt-done');
  });

  it('propagates non-unique create failures untouched', async () => {
    mocks.createAttempt.mockRejectedValue(new Error('connection reset'));
    await expect(startIeltsAttempt({ userId: 'student-1', testId: 'test-1' })).rejects.toThrow(
      'connection reset',
    );
  });

  it('force=true retires the active attempt so the unique key is free for the retake', async () => {
    mocks.createAttempt.mockResolvedValue(attemptRow({ id: 'attempt-new' }));

    const result = await startIeltsAttempt({ userId: 'student-1', testId: 'test-1', force: true });

    expect(mocks.abandonActiveAttempts).toHaveBeenCalledWith('student-1', 'test-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('attempt-new');
  });
});

describe('submitIeltsAttempt — exactly one finalisation', () => {
  beforeEach(() => {
    mocks.findAttemptById.mockResolvedValue(attemptRow());
    mocks.getTestForAttempt.mockResolvedValue(publishedTest(['q-1']));
    mocks.findQuestionsByIds.mockResolvedValue([questionRow()]);
  });

  it('finalises the status transition AND the response rows in one call', async () => {
    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(true);
    expect(mocks.finalizeAttemptSubmission).toHaveBeenCalledTimes(1);
    const call = mocks.finalizeAttemptSubmission.mock.calls[0][0] as {
      attemptId: string;
      userId: string;
      responses: unknown[];
    };
    expect(call.attemptId).toBe('attempt-1');
    expect(call.userId).toBe('student-1');
    expect(call.responses).toHaveLength(1);
  });

  it('the LOSING concurrent submission gets a deterministic 409 and no side effects', async () => {
    mocks.finalizeAttemptSubmission.mockResolvedValue({ finalized: false });

    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('ATTEMPT_ALREADY_SUBMITTED');
    }
    // The loser must not emit completion/answered events (exactly one finalisation).
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('the WINNER emits exactly one completion event', async () => {
    const result = await submitIeltsAttempt({
      userId: 'student-1',
      attemptId: 'attempt-1',
      answers: [{ questionId: 'q-1', answer: 'B' }],
    });

    expect(result.ok).toBe(true);
    const completed = events.emit.mock.calls.filter(([name]) => name === 'ielts.practice.completed');
    expect(completed).toHaveLength(1);
  });
});
