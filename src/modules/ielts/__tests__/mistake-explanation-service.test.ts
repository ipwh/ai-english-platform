// ============================================
// IELTS Mistake-Explanation Service — advisory-only gates (2026-10-03 VI)
// ============================================
// The AI is mocked. These tests pin: ownership + submission state, only
// incorrect responses are eligible, forbidden-claim screening, typed failures,
// and that the explanation NEVER touches the mark (nothing is written back).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  explainIeltsMistakeWithAI: vi.fn(),
  findAttemptById: vi.fn(),
  findResponseForQuestion: vi.fn(),
  getQuestionById: vi.fn(),
  getSectionById: vi.fn(),
  getTestById: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  explainIeltsMistakeWithAI: mocks.explainIeltsMistakeWithAI,
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  findAttemptById: mocks.findAttemptById,
  findResponseForQuestion: mocks.findResponseForQuestion,
  getQuestionById: mocks.getQuestionById,
  getSectionById: mocks.getSectionById,
  getTestById: mocks.getTestById,
}));

import { explainIeltsMistake } from '../services/mistake-explanation-service';

function aiOk(explanation: string, misconception = '', tip = '') {
  return {
    ok: true as const,
    data: { explanation, misconception, tip },
    provider: 'deepseek',
    durationMs: 12,
    promptVersion: 'IELTS_MISTAKE_EXPLANATION_V1',
    promptHash: 'h',
  };
}

const baseInput = {
  userId: 'student-1',
  attemptId: 'attempt-1',
  questionId: 'q1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAttemptById.mockResolvedValue({
    id: 'attempt-1',
    userId: 'student-1',
    testId: 'test-1',
    status: 'SUBMITTED',
  });
  mocks.findResponseForQuestion.mockResolvedValue({ id: 'r1', rawAnswer: 'FALSE', verdict: 'incorrect' });
  mocks.getQuestionById.mockResolvedValue({
    id: 'q1',
    testId: 'test-1',
    sectionId: 'sec-1',
    questionType: 'reading_true_false_not_given',
    skill: 'READING',
    prompt: 'Repair cafes charge visitors a fee.',
    answerKey: JSON.stringify('FALSE'),
    acceptedAnswers: null,
    options: null,
    explanation: 'The passage says repairs are free.',
    validationStatus: 'PUBLISHED',
  });
  mocks.getSectionById.mockResolvedValue({ id: 'sec-1', passageText: 'Volunteers mend items free of charge.' });
  mocks.getTestById.mockResolvedValue({
    id: 'test-1',
    status: 'PUBLISHED',
    origin: 'CATALOGUE',
    ownerUserId: null,
  });
});

describe('explainIeltsMistake — eligibility gates', () => {
  it('explains an incorrect answer and labels the result advisory-only', async () => {
    mocks.explainIeltsMistakeWithAI.mockResolvedValue(
      aiOk('The text says repairs are free of charge.', 'Your "FALSE" reading misses the word free.', 'Look for the exact phrase.'),
    );
    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.explanation).toContain('free of charge');
    expect(outcome.data.limitations.join(' ')).toContain('never changes your mark');
  });

  it('never leaks another user’s attempt (403)', async () => {
    mocks.findAttemptById.mockResolvedValue({
      id: 'attempt-1',
      userId: 'someone-else',
      testId: 'test-1',
      status: 'SUBMITTED',
    });
    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.status).toBe(403);
    expect(mocks.explainIeltsMistakeWithAI).not.toHaveBeenCalled();
  });

  it('refuses attempts that are not submitted yet (409)', async () => {
    mocks.findAttemptById.mockResolvedValue({
      id: 'attempt-1',
      userId: 'student-1',
      testId: 'test-1',
      status: 'IN_PROGRESS',
    });
    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(409);
      expect(outcome.error).toBe('ATTEMPT_NOT_SUBMITTED');
    }
  });

  it('only explains answers scored incorrect (409 otherwise)', async () => {
    mocks.findResponseForQuestion.mockResolvedValue({ id: 'r1', rawAnswer: 'TRUE', verdict: 'correct' });
    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe('NOT_AN_INCORRECT_ANSWER');
    expect(mocks.explainIeltsMistakeWithAI).not.toHaveBeenCalled();
  });

  it('requires a stored response (404) and a PUBLISHED question of the same test (404)', async () => {
    mocks.findResponseForQuestion.mockResolvedValue(null);
    const missing = await explainIeltsMistake(baseInput);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);

    mocks.findResponseForQuestion.mockResolvedValue({ id: 'r1', rawAnswer: 'FALSE', verdict: 'incorrect' });
    mocks.getQuestionById.mockResolvedValue({
      id: 'q1',
      testId: 'test-1',
      sectionId: null,
      questionType: 'reading_true_false_not_given',
      skill: 'READING',
      prompt: 'x',
      answerKey: JSON.stringify('FALSE'),
      acceptedAnswers: null,
      options: null,
      explanation: null,
      validationStatus: 'QA_REQUIRED',
    });
    const unpublished = await explainIeltsMistake(baseInput);
    expect(unpublished.ok).toBe(false);
    if (!unpublished.ok) expect(unpublished.status).toBe(404);
  });

  it('explains an INSTANT self-study item for its owner, flagged as unreviewed (2026-10-03 VII)', async () => {
    mocks.getTestById.mockResolvedValue({
      id: 'test-1',
      status: 'DRAFT',
      origin: 'INSTANT',
      ownerUserId: 'student-1',
    });
    mocks.getQuestionById.mockResolvedValue({
      id: 'q1',
      testId: 'test-1',
      sectionId: 'sec-1',
      questionType: 'reading_true_false_not_given',
      skill: 'READING',
      prompt: 'Repair cafes charge visitors a fee.',
      answerKey: JSON.stringify('FALSE'),
      acceptedAnswers: null,
      options: null,
      explanation: null,
      validationStatus: 'QA_REQUIRED',
    });
    mocks.explainIeltsMistakeWithAI.mockResolvedValue(
      aiOk(
        'The passage says volunteers mend items free of charge.',
        'Your “FALSE” reading misses the word free.',
        'Check the exact phrase.',
      ),
    );

    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.limitations.join(' ')).toContain('INSTANT self-study');
  });

  it('refuses an INSTANT item owned by another student (404 — never explained)', async () => {
    mocks.getTestById.mockResolvedValue({
      id: 'test-1',
      status: 'DRAFT',
      origin: 'INSTANT',
      ownerUserId: 'student-2',
    });
    mocks.getQuestionById.mockResolvedValue({
      id: 'q1',
      testId: 'test-1',
      sectionId: 'sec-1',
      questionType: 'reading_true_false_not_given',
      skill: 'READING',
      prompt: 'x',
      answerKey: JSON.stringify('FALSE'),
      acceptedAnswers: null,
      options: null,
      explanation: null,
      validationStatus: 'QA_REQUIRED',
    });

    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.status).toBe(404);
    expect(mocks.explainIeltsMistakeWithAI).not.toHaveBeenCalled();
  });
});

describe('explainIeltsMistake — screening & typed failures', () => {
  it('strips forbidden band/examiner claims and records the limitation', async () => {
    mocks.explainIeltsMistakeWithAI.mockResolvedValue(
      aiOk('The text says repairs are free. This guarantees band 9.', 'A certified examiner would agree.', ''),
    );
    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.explanation).toBe('The text says repairs are free.');
    expect(outcome.data.misconception).toBe('');
    expect(outcome.data.limitations.join(' ')).toContain('FORBIDDEN_CLAIM_FILTERED');
  });

  it('fails cleanly when everything was filtered (422, nothing fabricated)', async () => {
    mocks.explainIeltsMistakeWithAI.mockResolvedValue(aiOk('This guarantees band 9.', '', ''));
    const outcome = await explainIeltsMistake(baseInput);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe('AI_OUTPUT_FILTERED');
  });

  it('maps AI failures to typed statuses', async () => {
    for (const [failure, status] of [
      ['AI_PROVIDER_TIMEOUT', 504],
      ['AI_PROVIDER_ERROR', 502],
      ['AI_INVALID_JSON', 422],
    ] as const) {
      mocks.explainIeltsMistakeWithAI.mockResolvedValue({
        ok: false,
        failure,
        error: 'x',
        provider: null,
        durationMs: 5,
        promptVersion: 'v',
        promptHash: 'h',
      });
      const outcome = await explainIeltsMistake(baseInput);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.status).toBe(status);
    }
  });

  it('propagates budget exhaustion untouched (route maps to 503)', async () => {
    mocks.explainIeltsMistakeWithAI.mockRejectedValue(new Error('AI daily budget exhausted'));
    await expect(explainIeltsMistake(baseInput)).rejects.toThrow('budget');
  });
});
