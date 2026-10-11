// ============================================
// Self-Directed Practice — generation gate, delivery gating and submission
// tests (Sprint 140)
// ============================================
// Phase 5 requirements covered here: malformed AI output, premature answer-key
// disclosure, cross-student access denial, duplicate submission, and persistence
// failure handling.
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOwnedSet: vi.fn(),
  createSubmission: vi.fn(),
  getSubmission: vi.fn(),
  gradeAI: vi.fn(),
  generateAI: vi.fn(),
  persistGeneratedSet: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  gradeCustomPracticeWithAI: mocks.gradeAI,
  generateCustomPracticeWithAI: mocks.generateAI,
}));

vi.mock('../repositories/custom-practice-repo', () => ({
  getOwnedSet: mocks.getOwnedSet,
  createSubmissionWithResponses: mocks.createSubmission,
  getSubmissionWithResponses: mocks.getSubmission,
  persistGeneratedSet: mocks.persistGeneratedSet,
}));

// The blind-solve verifier is a separate AI pass; these tests are about the generation loop's
// type handling, so verification is stubbed to accept everything it is given (and the real
// verifier still has its own suite).
vi.mock('../services/verification-service', async () => {
  const actual = await vi.importActual<typeof import('../services/verification-service')>(
    '../services/verification-service'
  );
  return {
    ...actual,
    verifyGeneratedQuestions: vi.fn(async ({ questions }: { questions: unknown[] }) => ({
      accepted: questions,
      rejected: [],
      verifierAvailable: true,
      verificationPromptVersion: 'test-verification-v1',
    })),
  };
});

import { CustomPracticeError } from '../domain/types';
import { toDeliveredSet } from '../services/delivery-service';
import { typesToAimAt, validateGeneratedQuestions } from '../services/generation-service';
import { submitCustomPracticeSet } from '../services/submission-service';
import type { CustomPracticeGeneratedQuestion } from '@/modules/ai';

const SPEC = {
  requestText: 'past perfect vs past simple',
  objective: '[grammar] past perfect vs past simple',
  category: 'grammar' as const,
  difficulty: 'intermediate' as const,
  questionCount: 3,
  exerciseTypes: ['mc', 'transformation'] as const,
  interpretation: null,
};

const generatedQuestion = (
  overrides: Partial<CustomPracticeGeneratedQuestion> = {}
): CustomPracticeGeneratedQuestion => ({
  orderIndex: 0,
  questionType: 'mc',
  instructions: 'Choose the correct option.',
  prompt: 'By the time we arrived, the film ___.  A) started  B) had started  C) starts  D) starting',
  answerKey: 'B',
  acceptedAnswers: [],
  rejectedAnswers: [{ answer: 'A', why: 'past simple is wrong here' }],
  rubric: { marks: 1, criteria: ['correct tense'] },
  targetRule: 'past perfect for the earlier past action',
  explanationZh: null,
  explanationEn: 'The earlier of two past actions takes the past perfect.',
  misconceptionTags: ['tense-choice'],
  maxMarks: 1,
  ...overrides,
});

describe('typesToAimAt (the ticked type is a promise)', () => {
  const spec = (types: readonly string[], questionCount = 3) =>
    ({ ...SPEC, exerciseTypes: types, questionCount }) as never;

  it('aims a top-up round at the ticked types that are still missing', () => {
    // Round 1 returned only mc; 轉換 and 造句 were ticked and still fit in the deficit.
    expect(typesToAimAt(spec(['mc', 'transformation', 'sentence_production']), [{ questionType: 'mc' }] as never, 2)).toEqual([
      'transformation',
      'sentence_production',
    ]);
  });

  it('leaves the first round and complete sets alone', () => {
    expect(typesToAimAt(spec(['mc', 'transformation']), [], 3)).toEqual(['mc', 'transformation']);
    expect(typesToAimAt(spec(['mc', 'transformation']), [{ questionType: 'mc' }, { questionType: 'transformation' }] as never, 1)).toEqual([
      'mc',
      'transformation',
    ]);
  });

  it('keeps the full list when the missing types would not fit the remaining slots', () => {
    // Four missing types but only one slot: narrowing would waste the round (count wins).
    expect(typesToAimAt(spec(['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production']), [{ questionType: 'mc' }] as never, 1)).toEqual([
      'mc',
      'fill_blank',
      'error_correction',
      'transformation',
      'sentence_production',
    ]);
  });

  it('never narrows a single-type selection (nothing was left out)', () => {
    expect(typesToAimAt(spec(['mc']), [{ questionType: 'mc' }] as never, 2)).toEqual(['mc']);
  });
});

describe('generateCustomPracticeSet — the top-up round is aimed at the missing types', () => {
  beforeEach(() => {
    mocks.persistGeneratedSet.mockReset();
    mocks.persistGeneratedSet.mockImplementation(async (input: { questions: unknown[] }) => ({
      setId: 'set-1',
      questions: (input.questions as Array<{ orderIndex: number }>).map((question, index) => ({
        id: `q-${index}`,
        orderIndex: question.orderIndex,
        maxMarks: 1,
        questionType: 'mc',
      })),
    }));
  });

  it('asks the second round ONLY for the ticked types round 1 did not deliver', async () => {
    const spec = {
      ...SPEC,
      questionCount: 2,
      exerciseTypes: ['mc', 'transformation'],
    };
    // Round 1 yields ONE mc item (so a top-up is needed, and 轉換 is still missing).
    // Round 2 should then be asked for transformation alone.
    mocks.generateAI
      .mockResolvedValueOnce({
        promptVersion: 'test-v4',
        questions: [generatedQuestion()],
      })
      .mockResolvedValueOnce({
        promptVersion: 'test-v4',
        questions: [
          generatedQuestion({
            questionType: 'transformation',
            prompt: 'Rewrite: The film started before we arrived.',
            answerKey: 'The film had started before we arrived.',
            rubric: { marks: 1, criteria: ['uses the past perfect for the earlier action'] },
          }),
        ],
      });

    const { generateCustomPracticeSet } = await import('../services/generation-service');
    const result = await generateCustomPracticeSet({ ownerUserId: 'student-1', spec: spec as never });

    expect(mocks.generateAI).toHaveBeenCalledTimes(2);
    expect(mocks.generateAI.mock.calls[0][0].exerciseTypes).toEqual(['mc', 'transformation']);
    // The second call is narrowed to what the student ticked and never received.
    expect(mocks.generateAI.mock.calls[1][0].exerciseTypes).toEqual(['transformation']);
    expect(result.missingTypes).toEqual([]);
  });

  it('reports a ticked type that never arrived instead of staying silent', async () => {
    const spec = { ...SPEC, questionCount: 2, exerciseTypes: ['mc', 'transformation'] };
    // Every round returns the same mc item: the top-up round cannot add 轉換, so it must be reported.
    mocks.generateAI.mockReset();
    mocks.generateAI.mockResolvedValue({
      promptVersion: 'test-v4',
      questions: [generatedQuestion()],
    });

    const { generateCustomPracticeSet } = await import('../services/generation-service');
    const result = await generateCustomPracticeSet({ ownerUserId: 'student-1', spec: spec as never });

    expect(result.missingTypes).toEqual(['transformation']);
    expect(result.deliveredCount).toBeLessThan(result.requestedCount);
  });
});

describe('validateGeneratedQuestions (deterministic gate)', () => {
  it('accepts a well-formed item and normalizes its order index', () => {
    const result = validateGeneratedQuestions([generatedQuestion()], SPEC as never);

    expect(result.dropped).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].orderIndex).toBe(0);
  });

  it('drops a question type the student did not ask for', () => {
    const result = validateGeneratedQuestions([generatedQuestion({ questionType: 'sentence_production' })], SPEC as never);
    expect(result.valid).toHaveLength(0);
    expect(result.dropped[0].reason).toContain('not requested');
  });

  it('drops an mc item whose key is not a single option letter', () => {
    const result = validateGeneratedQuestions([generatedQuestion({ answerKey: 'had started' })], SPEC as never);
    expect(result.valid).toHaveLength(0);
    expect(result.dropped[0].reason).toContain('not a single option letter');
  });

  it('drops an mc item that does not present exactly four lettered options', () => {
    const result = validateGeneratedQuestions(
      [generatedQuestion({ prompt: 'By the time we arrived, the film ___. A) started B) had started' })],
      SPEC as never
    );
    expect(result.valid).toHaveLength(0);
    expect(result.dropped[0].reason).toContain('four lettered options');
  });

  it('drops a duplicated tested point (identical prompt)', () => {
    const result = validateGeneratedQuestions(
      [generatedQuestion(), generatedQuestion({ orderIndex: 1 })],
      SPEC as never
    );
    expect(result.valid).toHaveLength(1);
    expect(result.dropped[0].reason).toContain('duplicate');
  });

  it('drops an item whose rubric marks disagree with maxMarks', () => {
    const result = validateGeneratedQuestions(
      [generatedQuestion({ rubric: { marks: 2, criteria: ['x'] }, maxMarks: 1 })],
      SPEC as never
    );
    expect(result.valid).toHaveLength(0);
    expect(result.dropped[0].reason).toContain('do not match');
  });

  it('never exceeds the requested question count', () => {
    const items = [1, 2, 3, 4].map(index =>
      generatedQuestion({ orderIndex: index - 1, prompt: `Fill ___. A) is B) are C) was D) were  (variant ${index})` })
    );
    const result = validateGeneratedQuestions(items, SPEC as never);
    expect(result.valid).toHaveLength(3);
  });
});

describe('delivery gating (no premature answer-key disclosure)', () => {
  const setRow = {
    id: 'set-1',
    objective: '[grammar] past perfect',
    category: 'grammar',
    difficulty: 'intermediate',
    interpretation: null,
    createdAt: new Date('2026-10-10T00:00:00Z'),
    questions: [
      {
        id: 'q1',
        orderIndex: 0,
        questionType: 'mc',
        instructions: 'Choose.',
        prompt: 'By the time we arrived, the film ___.  A) started  B) had started  C) starts  D) starting',
        targetRule: 'past perfect',
        maxMarks: 1,
        // Server-only fields that must NOT survive delivery:
        answerKey: 'B',
        acceptedAnswers: '[]',
        rubric: '{"marks":1}',
        explanationEn: 'The earlier action takes the past perfect.',
        misconceptionTags: '["tense-choice"]',
      },
    ],
  };

  it('delivers a question without key, rubric, explanation or tags', () => {
    const delivered = toDeliveredSet(setRow as never, false);
    const serialized = JSON.stringify(delivered);

    expect(delivered.questions).toHaveLength(1);
    expect(delivered.questions[0]).not.toHaveProperty('answerKey');
    expect(serialized).not.toContain('had started.');
    expect(serialized).not.toContain('rubric');
    expect(serialized).not.toContain('explanationEn');
    expect(serialized).not.toContain('misconceptionTags');
    expect(delivered.submitted).toBe(false);
  });
});

describe('submitCustomPracticeSet', () => {
  const setRow = {
    id: 'set-1',
    ownerUserId: 'student-1',
    category: 'grammar',
    difficulty: 'intermediate',
    submission: null,
    questions: [
      {
        id: 'q1',
        orderIndex: 0,
        questionType: 'mc',
        instructions: 'Choose.',
        prompt: 'x A) a B) b C) c D) d',
        answerKey: 'B',
        acceptedAnswers: '["b option"]',
        rejectedAnswers: '[]',
        rubric: '{"marks":1,"criteria":["tense"]}',
        targetRule: 'past perfect',
        explanationZh: null,
        explanationEn: 'Because of the earlier action.',
        misconceptionTags: '["tense-choice"]',
        maxMarks: 1,
      },
    ],
  };

  beforeEach(() => {
    mocks.getOwnedSet.mockReset();
    mocks.createSubmission.mockReset();
    mocks.getSubmission.mockReset();
    mocks.gradeAI.mockReset();
  });

  it('denies another student (owner-scoped read → not found, never 403)', async () => {
    mocks.getOwnedSet.mockResolvedValue(null);

    await expect(
      submitCustomPracticeSet({ setId: 'set-1', ownerUserId: 'other-student', answers: { q1: 'B' } })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(mocks.createSubmission).not.toHaveBeenCalled();
  });

  it('refuses a second submission (fast path)', async () => {
    mocks.getOwnedSet.mockResolvedValue({ ...setRow, submission: { id: 'sub-1' } });

    await expect(
      submitCustomPracticeSet({ setId: 'set-1', ownerUserId: 'student-1', answers: { q1: 'B' } })
    ).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });

  it('rejects unknown question ids instead of silently ignoring them', async () => {
    mocks.getOwnedSet.mockResolvedValue(setRow);

    await expect(
      submitCustomPracticeSet({ setId: 'set-1', ownerUserId: 'student-1', answers: { ghost: 'B' } })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('requires at least one answer', async () => {
    mocks.getOwnedSet.mockResolvedValue(setRow);

    await expect(
      submitCustomPracticeSet({ setId: 'set-1', ownerUserId: 'student-1', answers: { q1: '   ' } })
    ).rejects.toMatchObject({ code: 'NO_ANSWERS' });
  });

  it('grades, persists once and returns the delivered results with the reference answer', async () => {
    mocks.getOwnedSet.mockResolvedValue(setRow);
    mocks.createSubmission.mockResolvedValue({ id: 'sub-1' });
    mocks.getSubmission.mockResolvedValue({
      setId: 'set-1',
      submittedAt: new Date('2026-10-10T01:00:00Z'),
      gradedAt: new Date('2026-10-10T01:00:01Z'),
      awardedMarks: 1,
      totalMarks: 1,
      needsReviewCount: 0,
      overallFeedback: 'Auto-marked practice result.',
      responses: [
        {
          questionId: 'q1',
          verdict: 'correct',
          awardedMarks: 1,
          rationale: 'Correct.',
          referenceAnswer: 'B',
          acceptedAlternatives: '["b option"]',
          improvement: null,
          needsReview: false,
          question: {
            orderIndex: 0,
            maxMarks: 1,
            explanationEn: 'Because of the earlier action.',
            explanationZh: null,
            misconceptionTags: '["tense-choice"]',
            targetRule: 'past perfect',
          },
        },
      ],
    });

    const results = await submitCustomPracticeSet({
      setId: 'set-1',
      ownerUserId: 'student-1',
      answers: { q1: 'B' },
    });

    expect(mocks.createSubmission).toHaveBeenCalledTimes(1);
    expect(mocks.gradeAI).not.toHaveBeenCalled(); // objective item: deterministic, no AI cost
    expect(results.awardedMarks).toBe(1);
    expect(results.responses[0].verdict).toBe('correct');
    expect(results.responses[0].referenceAnswer).toBe('B');
    expect(results.gradingDegraded).toBe(false);
  });

  it('propagates a persistence failure (nothing is reported as marked)', async () => {
    mocks.getOwnedSet.mockResolvedValue(setRow);
    mocks.createSubmission.mockRejectedValue(new Error('deadlock detected'));

    await expect(
      submitCustomPracticeSet({ setId: 'set-1', ownerUserId: 'student-1', answers: { q1: 'B' } })
    ).rejects.toThrow('deadlock detected');
  });

  it('maps a unique violation on the set to ALREADY_SUBMITTED', async () => {
    mocks.getOwnedSet.mockResolvedValue(setRow);
    mocks.createSubmission.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on the fields: (`setId`)'), { code: 'P2002' })
    );

    await expect(
      submitCustomPracticeSet({ setId: 'set-1', ownerUserId: 'student-1', answers: { q1: 'B' } })
    ).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });

  it('exposes a typed error surface for callers', () => {
    const error = new CustomPracticeError('NOT_FOUND', 'nope');
    expect(error.code).toBe('NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
  });
});
