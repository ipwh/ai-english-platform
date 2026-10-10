// ============================================
// Self-Directed Practice — blind verification tests (Sprint 141, P0 #1)
// ============================================
// Covers the mandated cases: incorrect-but-well-formed answer keys, ambiguous
// questions, contradictory rubrics, verifier failure and timeout — with the
// fail-closed rule that nothing is delivered when verification cannot run.
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAI: vi.fn(),
  gradeAI: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  verifyCustomPracticeWithAI: mocks.verifyAI,
  gradeCustomPracticeWithAI: mocks.gradeAI,
}));

import type { PracticeSpec, ValidatedQuestion } from '../domain/types';
import { screenForDeterministicDefects, verifyGeneratedQuestions } from '../services/verification-service';

const SPEC: PracticeSpec = {
  requestText: 'past perfect vs past simple',
  objective: '[grammar] past perfect vs past simple',
  category: 'grammar',
  difficulty: 'intermediate',
  questionCount: 3,
  exerciseTypes: ['mc', 'transformation'],
  interpretation: null,
};

function question(overrides: Partial<ValidatedQuestion> = {}): ValidatedQuestion {
  return {
    orderIndex: 0,
    questionType: 'mc',
    instructions: 'Choose the correct option.',
    prompt: 'By the time we arrived, the film ___. A) started B) had started C) starts D) starting',
    answerKey: 'B',
    acceptedAnswers: [],
    rejectedAnswers: [],
    rubric: { marks: 1, criteria: ['correct use of the past perfect'] },
    targetRule: 'past perfect',
    explanationZh: null,
    explanationEn: 'The earlier past action takes the past perfect.',
    misconceptionTags: [],
    maxMarks: 1,
    ...overrides,
  };
}

const verifyResult = (index: number, overrides: Record<string, unknown> = {}) => ({
  index,
  answer: 'B',
  confidence: 0.9,
  ambiguous: false,
  ambiguousReason: null,
  rubricSatisfiable: true,
  issue: null,
  ...overrides,
});

describe('screenForDeterministicDefects (no model call)', () => {
  it('rejects an item whose instructions demand two answers but is single-keyed', () => {
    const rejections = screenForDeterministicDefects([
      question({ instructions: 'Choose two correct options.' }),
    ]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('more than one answer');
  });

  it('rejects an item whose rubric never references the target rule', () => {
    const rejections = screenForDeterministicDefects([
      question({ rubric: { marks: 1, criteria: ['nice handwriting'] } }),
    ]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('target rule');
  });

  it('rejects an item whose own explanation admits it is broken', () => {
    const rejections = screenForDeterministicDefects([
      question({ explanationEn: 'Both options are correct, so this item is ambiguous.' }),
    ]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('defective');
  });

  it('accepts a coherent item', () => {
    expect(screenForDeterministicDefects([question()])).toEqual([]);
  });
});

describe('verifyGeneratedQuestions', () => {
  beforeEach(() => {
    mocks.verifyAI.mockReset();
    mocks.gradeAI.mockReset();
  });

  it('accepts an item whose independent answer matches the key', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'custom-practice-verification-v1', results: [verifyResult(0)] });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.verifierAvailable).toBe(true);
    expect(outcome.accepted).toHaveLength(1);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.verificationPromptVersion).toBe('custom-practice-verification-v1');
  });

  it('rejects a well-formed item whose answer key is wrong (independent answer disagrees)', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(0, { answer: 'A' })] });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('does not match the proposed key');
  });

  it('accepts an independent answer that matches an accepted alternative', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(0, { answer: 'had started' })] });
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'custom-practice-grading-v1',
      results: [
        {
          questionId: 'verify-0',
          verdict: 'correct',
          awardedMarks: 1,
          rationale: 'The independent answer satisfies the rubric.',
          improvement: null,
          confidence: 0.95,
        },
      ],
    });

    const outcome = await verifyGeneratedQuestions({
      spec: SPEC,
      questions: [question({ questionType: 'fill_blank', answerKey: 'had started', acceptedAnswers: ['had started'] })],
    });

    expect(outcome.accepted).toHaveLength(1);
  });

  it('rejects an ambiguous question', async () => {
    mocks.verifyAI.mockResolvedValue({
      promptVersion: 'v1',
      results: [verifyResult(0, { ambiguous: true, ambiguousReason: 'two options are defensible' })],
    });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('ambiguous');
  });

  it('rejects a question flagged as targeting the wrong structure', async () => {
    mocks.verifyAI.mockResolvedValue({
      promptVersion: 'v1',
      results: [verifyResult(0, { issue: 'the question tests the passive, not the past perfect' })],
    });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('passive');
  });

  it('rejects an unsatisfiable rubric', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(0, { rubricSatisfiable: false })] });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('unsatisfiable');
  });

  it('rejects an item the verifier was not confident about', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(0, { confidence: 0.2 })] });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('not confident');
  });

  it('reports a missing verifier result instead of assuming the item is fine', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(99)] });

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question()] });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('no result');
  });

  it('drops everything (rather than delivering unverified content) when the verifier times out', async () => {
    mocks.verifyAI.mockRejectedValue(new Error('Request timed out after 60000ms'));

    const outcome = await verifyGeneratedQuestions({ spec: SPEC, questions: [question(), question()] });

    expect(outcome.verifierAvailable).toBe(false);
    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected).toHaveLength(2);
    expect(outcome.rejected[0].reason).toContain('verifier unavailable');
  });

  it('checks open-ended items through the rubric: an independent solution rejected by the rubric drops the item', async () => {
    mocks.verifyAI.mockResolvedValue({
      promptVersion: 'v1',
      results: [verifyResult(0, { answer: 'She has finished the report already.', confidence: 0.9 })],
    });
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'custom-practice-grading-v1',
      results: [
        { questionId: 'verify-0', verdict: 'incorrect', awardedMarks: 0, rationale: 'wrong tense', improvement: null, confidence: 0.9 },
      ],
    });

    const outcome = await verifyGeneratedQuestions({
      spec: SPEC,
      questions: [question({ questionType: 'transformation', rubric: { marks: 2, criteria: ['correct past perfect form'] }, maxMarks: 2 })],
    });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('independent solution');
  });

  it('accepts an open-ended item whose independent solution the rubric accepts', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(0, { answer: 'She had finished.' })] });
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'v1',
      results: [
        { questionId: 'verify-0', verdict: 'partially_correct', awardedMarks: 1, rationale: 'acceptable', improvement: null, confidence: 0.8 },
      ],
    });

    const outcome = await verifyGeneratedQuestions({
      spec: SPEC,
      questions: [question({ questionType: 'transformation', rubric: { marks: 2, criteria: ['correct past perfect form'] }, maxMarks: 2 })],
    });

    expect(outcome.accepted).toHaveLength(1);
  });

  it('drops open-ended items when the rubric check cannot run (fail closed)', async () => {
    mocks.verifyAI.mockResolvedValue({ promptVersion: 'v1', results: [verifyResult(0, { answer: 'She had finished.' })] });
    mocks.gradeAI.mockRejectedValue(new Error('provider 502'));

    const outcome = await verifyGeneratedQuestions({
      spec: SPEC,
      questions: [question({ questionType: 'transformation', rubric: { marks: 2, criteria: ['correct past perfect form'] }, maxMarks: 2 })],
    });

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0].reason).toContain('rubric check could not run');
  });

  it('never calls the model when every item already failed the deterministic screen', async () => {
    const outcome = await verifyGeneratedQuestions({
      spec: SPEC,
      questions: [question({ instructions: 'Choose two correct options.' })],
    });

    expect(mocks.verifyAI).not.toHaveBeenCalled();
    expect(outcome.accepted).toHaveLength(0);
  });
});
