// ============================================
// Self-Directed Practice — grading tests (Sprint 140)
// ============================================
// Phase 5 requirements covered here: valid alternative answers, incorrect
// answers with useful feedback, malformed/low-confidence AI output, and AI
// provider errors/timeouts — with the fail-closed rule that a marking failure
// can NEVER become an "incorrect" verdict.
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ gradeAI: vi.fn() }));

vi.mock('@/modules/ai', () => ({
  gradeCustomPracticeWithAI: mocks.gradeAI,
}));

import {
  OPEN_ENDED_MIN_CONFIDENCE,
  buildOverallFeedback,
  gradeCustomPracticeAnswers,
  gradeObjectiveItem,
  normalizeFreeTextAnswer,
} from '../services/grading-service';

const objective = (overrides: Partial<Parameters<typeof gradeObjectiveItem>[0]> = {}) => ({
  questionId: 'q1',
  answerText: 'B',
  answerKey: 'B',
  acceptedAnswers: [],
  maxMarks: 1,
  ...overrides,
});

const openEndedQuestion = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'q2',
  questionType: 'transformation',
  instructions: 'Rewrite the sentence.',
  prompt: 'She has finished the report.',
  targetRule: 'present perfect',
  rubric: '{"marks":2,"criteria":["correct tense"]}',
  maxMarks: 2,
  answerKey: 'She has finished the report already.',
  acceptedAnswers: [],
  rejectedAnswers: [],
  explanationEn: 'Present perfect links a past action to now.',
  answerText: 'She has just finished the report.',
  ...overrides,
});

describe('normalizeFreeTextAnswer', () => {
  it('is case-, whitespace- and trailing-punctuation-insensitive', () => {
    expect(normalizeFreeTextAnswer('  The   CAT sat. ')).toBe('the cat sat');
  });

  it('normalizes typographic apostrophes so variants compare equal', () => {
    expect(normalizeFreeTextAnswer('don\u2019t know')).toBe(normalizeFreeTextAnswer("don't know"));
  });
});

describe('deterministic objective grading', () => {
  it('accepts the key exactly', () => {
    const item = gradeObjectiveItem(objective());
    expect(item.verdict).toBe('correct');
    expect(item.awardedMarks).toBe(1);
    expect(item.needsReview).toBe(false);
  });

  it('accepts listed alternative answers (never exact-string-only)', () => {
    const item = gradeObjectiveItem(objective({ answerText: 'has finished', answerKey: 'has completed', acceptedAnswers: ['has finished'] }));
    expect(item.verdict).toBe('correct');
    expect(item.awardedMarks).toBe(1);
  });

  it('sends fill-in-the-blank answers through the AI semantic marker', async () => {
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'custom-practice-grading-v1',
      results: [
        {
          questionId: 'q2',
          verdict: 'correct',
          awardedMarks: 1,
          rationale: 'The answer is grammatically equivalent in this context.',
          improvement: null,
          confidence: 0.95,
        },
      ],
    });

    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'grammar', difficulty: 'intermediate' },
      questions: [openEndedQuestion({ questionId: 'q2', questionType: 'fill_blank', maxMarks: 1 })],
      objective: [],
    });

    expect(mocks.gradeAI).toHaveBeenCalledOnce();
    expect(result.items[0].verdict).toBe('correct');
  });

  it('marks a wrong answer incorrect with actionable feedback', () => {
    const item = gradeObjectiveItem(objective({ answerText: 'A' }));
    expect(item.verdict).toBe('incorrect');
    expect(item.awardedMarks).toBe(0);
    expect(item.rationale).toContain('Expected: B');
    expect(item.improvement).toBeTruthy();
    expect(item.needsReview).toBe(false);
  });

  it('treats an unanswered objective item as zero without calling it a mistake in English usage', () => {
    const item = gradeObjectiveItem(objective({ answerText: '   ' }));
    expect(item.verdict).toBe('incorrect');
    expect(item.awardedMarks).toBe(0);
    expect(item.rationale).toContain('No answer');
  });
});

describe('open-ended AI grading (fail-closed)', () => {
  beforeEach(() => {
    mocks.gradeAI.mockReset();
  });

  it('uses the AI verdict, clamps marks and passes improvement through', async () => {
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'custom-practice-grading-v1',
      results: [
        {
          questionId: 'q2',
          verdict: 'partially_correct',
          awardedMarks: 1,
          rationale: 'Tense is correct but the adverb placement is odd.',
          improvement: 'Move "just" after "has".',
          confidence: 0.9,
        },
      ],
    });

    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'grammar', difficulty: 'intermediate' },
      questions: [openEndedQuestion()],
      objective: [],
    });

    expect(result.degraded).toBe(false);
    expect(result.items[0].verdict).toBe('partially_correct');
    expect(result.items[0].awardedMarks).toBe(1);
    expect(result.items[0].improvement).toContain('Move');
  });

  it('never awards more than maxMarks even if the model asks for it', async () => {
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'v1',
      results: [{ questionId: 'q2', verdict: 'correct', awardedMarks: 5, rationale: 'ok', improvement: null, confidence: 1 }],
    });

    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'grammar', difficulty: 'intermediate' },
      questions: [openEndedQuestion({ maxMarks: 2 })],
      objective: [],
    });

    expect(result.items[0].awardedMarks).toBe(2);
    expect(result.items[0].verdict).toBe('correct');
  });

  it('flags low-confidence judgements for review instead of asserting them', async () => {
    mocks.gradeAI.mockResolvedValue({
      promptVersion: 'v1',
      results: [
        {
          questionId: 'q2',
          verdict: 'incorrect',
          awardedMarks: 0,
          rationale: 'Ambiguous phrasing.',
          improvement: null,
          confidence: OPEN_ENDED_MIN_CONFIDENCE - 0.2,
        },
      ],
    });

    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'grammar', difficulty: 'intermediate' },
      questions: [openEndedQuestion()],
      objective: [],
    });

    expect(result.items[0].verdict).toBe('needs_review');
    expect(result.items[0].needsReview).toBe(true);
    expect(result.items[0].awardedMarks).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it('turns a provider failure/timeout into needs_review — never into "incorrect"', async () => {
    mocks.gradeAI.mockRejectedValue(new Error('Request timed out after 60000ms'));

    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'vocabulary', difficulty: 'basic' },
      questions: [openEndedQuestion()],
      objective: [objective({ answerText: 'B' })],
    });

    const openEnded = result.items.find(item => item.questionId === 'q2');
    expect(openEnded?.verdict).toBe('needs_review');
    expect(openEnded?.needsReview).toBe(true);
    expect(openEnded?.rationale).toContain('NOT marked');
    expect(result.degraded).toBe(true);
    // The objective item is still graded: partial success is reported honestly.
    expect(result.items.find(item => item.questionId === 'q1')?.verdict).toBe('correct');
  });

  it('handles a missing verdict for one item without failing the others', async () => {
    mocks.gradeAI.mockResolvedValue({ promptVersion: 'v1', results: [] });

    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'grammar', difficulty: 'intermediate' },
      questions: [openEndedQuestion()],
      objective: [],
    });

    expect(result.items[0].needsReview).toBe(true);
    expect(result.items[0].rationale).toContain('did not return a verdict');
  });

  it('does not call the AI at all when every open-ended answer is blank', async () => {
    const result = await gradeCustomPracticeAnswers({
      spec: { category: 'grammar', difficulty: 'intermediate' },
      questions: [openEndedQuestion({ answerText: '   ' })],
      objective: [],
    });

    expect(mocks.gradeAI).not.toHaveBeenCalled();
    expect(result.items[0].verdict).toBe('needs_review');
  });
});

describe('buildOverallFeedback', () => {
  it('summarizes the marks and never claims DSE validity', () => {
    const feedback = buildOverallFeedback([
      { questionId: 'a', verdict: 'correct', awardedMarks: 1, maxMarks: 1, rationale: '', improvement: null, needsReview: false },
      { questionId: 'b', verdict: 'incorrect', awardedMarks: 0, maxMarks: 1, rationale: '', improvement: null, needsReview: false },
      { questionId: 'c', verdict: 'needs_review', awardedMarks: 0, maxMarks: 2, rationale: '', improvement: null, needsReview: true },
    ]);

    expect(feedback).toContain('1 correct');
    expect(feedback).toContain('1 incorrect');
    expect(feedback).toContain('1 awaiting review');
    expect(feedback).toContain('not a validated HKDSE score');
    expect(feedback).toContain('not marked as wrong');
  });
});
