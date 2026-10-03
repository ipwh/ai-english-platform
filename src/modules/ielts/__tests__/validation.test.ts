// ============================================
// IELTS Question Validator — reject cases (machine screen)
// ============================================
import { describe, expect, it } from 'vitest';
import {
  assertPublishable,
  containsAnswerVerbatim,
  emptyBatchContext,
  isServableStatus,
  skillMatchesQuestionType,
  validateIeltsQuestion,
} from '../validation/question-validator';
import type { IeltsQuestionDefinition } from '../domain/types';

function baseQuestion(overrides: Partial<IeltsQuestionDefinition> = {}): IeltsQuestionDefinition {
  return {
    id: 'q-1',
    testId: 'test-1',
    orderIndex: 0,
    questionType: 'reading_multiple_choice',
    skill: 'READING',
    prompt: 'Which option is correct?',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    answerKey: 'B',
    explanation: 'The passage states Beta.',
    difficulty: 'MEDIUM',
    difficultyModel: 'ielts-platform-difficulty-v1',
    contentSource: { type: 'ORIGINAL_GENERATED' },
    generatorVersion: 'gen-v1',
    validationStatus: 'DRAFT',
    ...overrides,
  };
}

describe('Common structural checks', () => {
  it('skill/type mismatch is rejected', () => {
    const report = validateIeltsQuestion(baseQuestion({ skill: 'READING', questionType: 'listening_matching' }), undefined);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'SKILL_TYPE_MISMATCH')).toBe(true);
  });

  it('skillMatchesQuestionType maps prefixes correctly', () => {
    expect(skillMatchesQuestionType('READING', 'reading_true_false_not_given')).toBe(true);
    expect(skillMatchesQuestionType('LISTENING', 'reading_true_false_not_given')).toBe(false);
  });

  it('duplicate prompts within a batch are rejected', () => {
    const batch = emptyBatchContext();
    const q1 = baseQuestion();
    const q2 = baseQuestion({ id: 'q-2' });
    validateIeltsQuestion(q1, undefined, batch);
    const report = validateIeltsQuestion(q2, undefined, batch);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'DUPLICATE_PROMPT')).toBe(true);
  });

  it('missing content source is rejected', () => {
    const report = validateIeltsQuestion(
      baseQuestion({ contentSource: undefined as never }),
      undefined,
    );
    expect(report.ok).toBe(false);
  });
});

describe('Multiple-choice checks', () => {
  it('fewer than 3 options rejected', () => {
    const report = validateIeltsQuestion(baseQuestion({ options: ['A', 'B'] }), undefined);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'MC_TOO_FEW_OPTIONS')).toBe(true);
  });

  it('duplicate option text rejected', () => {
    const report = validateIeltsQuestion(baseQuestion({ options: ['Same', 'same', 'Other'] }), undefined);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'MC_DUPLICATE_OPTION')).toBe(true);
  });

  it('key not among options rejected', () => {
    const report = validateIeltsQuestion(baseQuestion({ answerKey: 'Z' }), undefined);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'MC_KEY_NOT_IN_OPTIONS')).toBe(true);
  });

  it('ambiguous "all/none of the above" options rejected by policy', () => {
    const report = validateIeltsQuestion(
      baseQuestion({ options: ['Alpha', 'Beta', 'All of the above'] }),
      undefined,
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'MC_BANNED_OPTION')).toBe(true);
  });
});

describe('Official format: one numbered question = one answer (multi-answer rejected)', () => {
  it('multiple-choice with two keys is rejected with authoring guidance', () => {
    const report = validateIeltsQuestion(baseQuestion({ answerKey: ['A', 'C'] }), undefined);
    expect(report.ok).toBe(false);
    const issue = report.issues.find((i) => i.code === 'MC_KEY_COUNT');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('two numbered questions');
  });

  it('completion item with two keys is rejected (use acceptedAnswers for variants)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_sentence_completion',
        options: undefined,
        answerKey: ['astronaut', 'spaceman'],
        wordLimit: { maxWords: 2, allowsNumber: false },
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 0, end: 18, text: 'The ancient sculpture' }],
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: 'The ancient sculpture was moved to the museum in 1998 after restoration.' },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'COMPLETION_KEY_COUNT')).toBe(true);
  });

  it('single-key completion with acceptedAnswers variants passes the key-count rule', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_sentence_completion',
        options: undefined,
        answerKey: 'sculpture',
        acceptedAnswers: ['ancient sculpture'],
        wordLimit: { maxWords: 2, allowsNumber: false },
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 0, end: 18, text: 'The ancient sculpture' }],
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: 'The ancient sculpture was moved to the museum in 1998 after restoration.' },
    );
    expect(report.issues.some((i) => i.code === 'COMPLETION_KEY_COUNT')).toBe(false);
  });

  it('rejects a completion whose answer already appears in the prompt (answer leakage)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_sentence_completion',
        options: undefined,
        prompt: 'The ancient sculpture was moved to the museum in 1998.',
        answerKey: 'sculpture',
        wordLimit: { maxWords: 2, allowsNumber: false },
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 0, end: 18, text: 'The ancient sculpture' }],
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: 'The ancient sculpture was moved to the museum in 1998 after restoration.' },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'ANSWER_LEAKED_IN_PROMPT')).toBe(true);
  });

  it('accepts the same item when the prompt keeps a blank (no leak)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_sentence_completion',
        options: undefined,
        prompt: 'The ancient ______ was moved to the museum in 1998.',
        answerKey: 'sculpture',
        wordLimit: { maxWords: 2, allowsNumber: false },
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 0, end: 18, text: 'The ancient sculpture' }],
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: 'The ancient sculpture was moved to the museum in 1998 after restoration.' },
    );
    expect(report.issues.some((i) => i.code === 'ANSWER_LEAKED_IN_PROMPT')).toBe(false);
  });

  it('rejects listening keys that are contracted words (official: never tested)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_sentence_completion',
        skill: 'LISTENING',
        options: undefined,
        prompt: 'The café ______ open until late on Sundays.',
        answerKey: "isn't",
        wordLimit: { maxWords: 1, allowsNumber: false },
        evidence: { expectedAnswer: "isn't", acceptedVariants: [] },
      }),
      { transcriptText: "Guide: The café isn't open until late on Sundays." },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'LISTENING_CONTRACTION_KEY')).toBe(true);
  });

  it('accepts a listening key with a non-contraction apostrophe (O’Brien is a name, not a contraction)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_sentence_completion',
        skill: 'LISTENING',
        options: undefined,
        prompt: 'The tour guide is called ______.',
        answerKey: "O'Brien",
        wordLimit: { maxWords: 1, allowsNumber: false },
        evidence: { expectedAnswer: "O'Brien", acceptedVariants: [] },
      }),
      { transcriptText: "Hello, my name is O'Brien and I will be your guide today." },
    );
    expect(report.issues.some((i) => i.code === 'LISTENING_CONTRACTION_KEY')).toBe(false);
  });

  it('matching with two keys is rejected (multi-answer = separate numbered questions)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_matching_headings',
        options: [
          { code: 'i', text: 'The first heading' },
          { code: 'ii', text: 'The second heading' },
        ],
        answerKey: ['i', 'ii'],
      }),
      undefined,
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'MATCHING_KEY_COUNT')).toBe(true);
  });
});

describe('True/False/Not Given checks', () => {
  it('invalid key rejected', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_true_false_not_given',
        answerKey: 'MAYBE',
        options: undefined,
        evidence: { passageId: 'p1', evidenceSpans: [{ start: 0, end: 5, text: 'Hello' }], reasoning: 'r', answerType: 'contrast' },
      }),
      { passageText: 'Hello world of passages' },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'TFNG_INVALID_KEY')).toBe(true);
  });

  it('FALSE without an explanation is flagged for QA (not silently published)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_true_false_not_given',
        answerKey: 'FALSE',
        options: undefined,
        explanation: undefined,
        evidence: { passageId: 'p1', evidenceSpans: [{ start: 0, end: 5, text: 'Hello' }], reasoning: 'r', answerType: 'contrast' },
      }),
      { passageText: 'Hello world of passages' },
    );
    expect(report.issues.some((i) => i.code === 'TFNG_FALSE_NEEDS_CONTRADICTION')).toBe(true);
  });
});

describe('Reading evidence checks', () => {
  const passage = 'The ancient sculpture was moved to the museum in 1998 after restoration.';

  it('missing evidence rejected', () => {
    const report = validateIeltsQuestion(baseQuestion({ evidence: undefined }), { passageText: passage });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'READING_MISSING_EVIDENCE')).toBe(true);
  });

  it('span text mismatch rejected (spans must slice-match the passage)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 0, end: 11, text: 'The ancient' }], // actual slice is "The ancient"
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: passage },
    );
    // This span actually matches — control case: no mismatch.
    expect(report.issues.some((i) => i.code === 'READING_SPAN_TEXT_MISMATCH')).toBe(false);

    const bad = validateIeltsQuestion(
      baseQuestion({
        id: 'q-2',
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 0, end: 11, text: 'TOTALLY WRONG' }],
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: passage },
    );
    expect(bad.ok).toBe(false);
    expect(bad.issues.some((i) => i.code === 'READING_SPAN_TEXT_MISMATCH')).toBe(true);
  });

  it('completion answer not locatable in the passage is rejected', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'reading_sentence_completion',
        options: undefined,
        answerKey: 'astronaut', // not in passage
        wordLimit: { maxWords: 2, allowsNumber: false },
        evidence: {
          passageId: 'p1',
          evidenceSpans: [{ start: 4, end: 11, text: 'ancient' }],
          reasoning: 'r',
          answerType: 'detail',
        },
      }),
      { passageText: passage },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'READING_ANSWER_NOT_LOCATABLE')).toBe(true);
  });
});

describe('Listening evidence checks', () => {
  const transcript = 'Guide: The tour starts at ten in the morning. Visitor: Great, thank you.';

  it('answer that is not in the transcript is REJECTED (undeliverable)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_short_answer',
        skill: 'LISTENING',
        options: undefined,
        answerKey: 'eleven',
        wordLimit: { maxWords: 2, allowsNumber: true },
        evidence: { expectedAnswer: 'eleven', wordLimit: { maxWords: 2, allowsNumber: true } },
      }),
      { transcriptText: transcript },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'LISTENING_ANSWER_NOT_IN_TRANSCRIPT')).toBe(true);
  });

  it('verbatim answer accepted (word boundary aware)', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_short_answer',
        skill: 'LISTENING',
        options: undefined,
        answerKey: 'ten',
        wordLimit: { maxWords: 2, allowsNumber: true },
        evidence: { expectedAnswer: 'ten' },
      }),
      { transcriptText: transcript },
    );
    expect(report.ok).toBe(true);
  });

  it('word-boundary containment does not match substrings', () => {
    expect(containsAnswerVerbatim('The tour starts at ten', 'te')).toBe(false);
    expect(containsAnswerVerbatim('The tour starts at ten', 'ten')).toBe(true);
  });

  it('completion key over its own word limit rejected', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_sentence_completion',
        skill: 'LISTENING',
        options: undefined,
        answerKey: 'ten in the morning',
        wordLimit: { maxWords: 2, allowsNumber: true },
        evidence: { expectedAnswer: 'ten in the morning', wordLimit: { maxWords: 2, allowsNumber: true } },
      }),
      { transcriptText: transcript },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'COMPLETION_KEY_OVER_LIMIT')).toBe(true);
  });

  it('multiple-choice: the correct OPTION TEXT must be supported by the transcript', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_multiple_choice',
        skill: 'LISTENING',
        options: ['Ten in the morning', 'Nine in the morning', 'Eleven in the morning'],
        answerKey: 'A',
        evidence: { expectedAnswer: 'Ten in the morning' },
      }),
      { transcriptText: transcript },
    );
    expect(report.ok).toBe(true);
  });

  it('multiple-choice: an option text absent from the transcript is rejected', () => {
    const report = validateIeltsQuestion(
      baseQuestion({
        questionType: 'listening_multiple_choice',
        skill: 'LISTENING',
        options: ['Midnight', 'Nine in the evening', 'Eleven at night'],
        answerKey: 'A',
        evidence: { expectedAnswer: 'Midnight' },
      }),
      { transcriptText: transcript },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'LISTENING_ANSWER_NOT_IN_TRANSCRIPT')).toBe(true);
  });
});

describe('Publishability gate', () => {
  it('an AI-validated item can never be served', () => {
    expect(isServableStatus('AI_VALIDATED')).toBe(false);
    expect(isServableStatus('QA_REQUIRED')).toBe(false);
    expect(isServableStatus('PUBLISHED')).toBe(true);
  });

  it('publication requires HUMAN_APPROVED + reviewer stamps', () => {
    expect(assertPublishable({ validationStatus: 'QA_REQUIRED' }).publishable).toBe(false);
    expect(
      assertPublishable({ validationStatus: 'HUMAN_APPROVED', reviewedBy: 'teacher-1', reviewedAt: new Date() })
        .publishable,
    ).toBe(true);
    expect(assertPublishable({ validationStatus: 'HUMAN_APPROVED', reviewedBy: null, reviewedAt: null }).publishable).toBe(false);
  });
});
