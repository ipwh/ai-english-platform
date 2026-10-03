// ============================================
// IELTS Objective Scorer — deterministic contract tests
// ============================================
// The AI never decides objective correctness; these tests pin the exact
// deterministic semantics (word limits, hyphenation, numbers, canonical keys).
import { describe, expect, it } from 'vitest';
import { scoreIeltsItem } from '../scoring/objective-scorer';
import type { IeltsQuestionType } from '../domain/types';

function item(overrides: Partial<Parameters<typeof scoreIeltsItem>[1]> = {}) {
  return {
    questionType: 'reading_multiple_choice' as IeltsQuestionType,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answerKey: 'B',
    ...overrides,
  };
}

describe('multiple choice', () => {
  it('accepts the key letter case-insensitively', () => {
    expect(scoreIeltsItem('b', item()).verdict).toBe('correct');
    expect(scoreIeltsItem('B.', item()).verdict).toBe('correct');
  });

  it('accepts the full option text only on an unambiguous match', () => {
    const result = scoreIeltsItem('Option B', item());
    expect(result.verdict).toBe('correct');
    expect(result.reason).toBe('MC_OPTION_TEXT_MATCH');
  });

  it('rejects a different option and unmatched text', () => {
    expect(scoreIeltsItem('C', item()).verdict).toBe('incorrect');
    expect(scoreIeltsItem('Option Z', item()).verdict).toBe('incorrect');
  });

  it('rejects an empty answer', () => {
    expect(scoreIeltsItem('   ', item()).reason).toBe('EMPTY_ANSWER');
  });
});

describe('True/False/Not Given + Yes/No/Not Given', () => {
  it('canonicalizes case and spacing', () => {
    const tfng = item({ questionType: 'reading_true_false_not_given', answerKey: 'NOT GIVEN', options: undefined });
    expect(scoreIeltsItem('not given', tfng).verdict).toBe('correct');
    expect(scoreIeltsItem('NOTGIVEN', tfng).verdict).toBe('correct');
    expect(scoreIeltsItem('Not Given.', tfng).verdict).toBe('correct');
    expect(scoreIeltsItem('True', tfng).verdict).toBe('incorrect');
  });

  it('YES/NO/NG uses its own token set', () => {
    const ynng = item({ questionType: 'reading_yes_no_not_given', answerKey: 'YES', options: undefined });
    expect(scoreIeltsItem('yes', ynng).verdict).toBe('correct');
    expect(scoreIeltsItem('True', ynng).verdict).toBe('incorrect');
  });

  it('garbage tokens are rejected, not coerced', () => {
    const tfng = item({ questionType: 'reading_true_false_not_given', answerKey: 'FALSE', options: undefined });
    expect(scoreIeltsItem('maybe', tfng).verdict).toBe('incorrect');
  });
});

describe('completion / short-answer families', () => {
  const completion = item({
    questionType: 'reading_sentence_completion',
    options: undefined,
    answerKey: 'sculpture',
    wordLimit: { maxWords: 2, allowsNumber: true },
  });

  it('matches case-insensitively with trailing punctuation tolerated', () => {
    expect(scoreIeltsItem('Sculpture.', completion).verdict).toBe('correct');
  });

  it('accepted variants are honored (authored, never invented at runtime)', () => {
    const withVariant = { ...completion, acceptedAnswers: ['the sculpture'] };
    expect(scoreIeltsItem('the Sculpture', withVariant).verdict).toBe('correct');
    expect(scoreIeltsItem('the Sculpture', withVariant).reason).toBe('ACCEPTED_VARIANT');
  });

  it('over-limit answers LOSE the mark (official)', () => {
    const result = scoreIeltsItem('a lovely sculpture', completion);
    expect(result.verdict).toBe('incorrect');
    expect(result.reason).toBe('WORD_LIMIT_EXCEEDED');
    expect(result.limitExceeded).toBe(true);
    expect(result.countsTowardScore).toBe(true);
  });

  it('hyphenated words count as single words for the limit', () => {
    const hyphenItem = { ...completion, answerKey: 'check-in', wordLimit: { maxWords: 1 } };
    expect(scoreIeltsItem('check-in', hyphenItem).verdict).toBe('correct');
  });

  it('number words and figures are equivalent', () => {
    const numberItem = { ...completion, answerKey: '15', wordLimit: { maxWords: 2, allowsNumber: true } };
    expect(scoreIeltsItem('fifteen', numberItem).verdict).toBe('correct');
    expect(scoreIeltsItem('fifteen', numberItem).reason).toBe('NUMBER_EQUIVALENT');
  });

  it('numbers are rejected when the rule disallows them', () => {
    const noNumber = { ...completion, answerKey: '15', wordLimit: { maxWords: 2, allowsNumber: false } };
    expect(scoreIeltsItem('15', noNumber).reason).toBe('NUMBER_NOT_ALLOWED');
  });

  it('does NOT expand spelling variants (official penalises incorrect spelling)', () => {
    expect(scoreIeltsItem('sculptur', completion).verdict).toBe('incorrect');
    expect(scoreIeltsItem('sculptures', completion).verdict).toBe('incorrect');
  });

  it('multi-answer (choose TWO) requires all answers, order-insensitive', () => {
    const multi = {
      ...completion,
      answerKey: ['A', 'C'],
      answerMode: 'multiple-order-insensitive' as const,
      options: undefined,
    };
    expect(scoreIeltsItem('C, A', multi).verdict).toBe('correct');
    expect(scoreIeltsItem('A', multi).verdict).toBe('incorrect');
    expect(scoreIeltsItem('A, B', multi).verdict).toBe('incorrect');
  });
});

describe('matching families', () => {
  it('matches option codes (letters or roman numerals)', () => {
    const matching = item({
      questionType: 'reading_matching_headings',
      options: [{ code: 'i', text: 'First heading' }, { code: 'ii', text: 'Second heading' }],
      answerKey: 'ii',
    });
    expect(scoreIeltsItem('II', matching).verdict).toBe('correct');
    expect(scoreIeltsItem('ii.', matching).verdict).toBe('correct');
    expect(scoreIeltsItem('i', matching).verdict).toBe('incorrect');
  });
});

describe('open-ended types are UNGRADABLE by the deterministic scorer', () => {
  it('writing tasks never receive a deterministic correctness verdict', () => {
    const result = scoreIeltsItem('essay text', {
      questionType: 'writing_task',
      answerKey: 'sample',
    });
    expect(result.verdict).toBe('ungradable');
    expect(result.countsTowardScore).toBe(false);
    expect(result.reason).toBe('OPEN_ENDED_NOT_DETERMINISTIC');
  });
});
