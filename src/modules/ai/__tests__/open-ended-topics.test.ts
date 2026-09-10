import { describe, expect, it } from 'vitest';
import {
  OPEN_ENDED_GRAMMAR_TOPICS,
  isOpenEndedGrammarTopic,
  resolveEffectiveQuestionType,
} from '../services/open-ended-topics';

describe('open-ended-topics — deterministic MC coercion for open answer spaces', () => {
  it('open-ended grammar topics coerce fill-blank → mc', () => {
    for (const topic of OPEN_ENDED_GRAMMAR_TOPICS) {
      expect(resolveEffectiveQuestionType('fill-blank', topic, undefined)).toBe('mc');
    }
  });

  it('closed grammar topics keep fill-blank', () => {
    expect(resolveEffectiveQuestionType('fill-blank', 'tenses', undefined)).toBe('fill-blank');
    expect(resolveEffectiveQuestionType('fill-blank', 'conditionals', undefined)).toBe('fill-blank');
    expect(resolveEffectiveQuestionType('fill-blank', 'passive-voice', undefined)).toBe('fill-blank');
  });

  it('non-grammar fill-blank (vocabulary cloze) is never coerced', () => {
    expect(resolveEffectiveQuestionType('fill-blank', undefined, 'vocabulary')).toBe('fill-blank');
    expect(resolveEffectiveQuestionType('fill-blank', undefined, 'reading')).toBe('fill-blank');
  });

  it('writing always resolves to short-writing', () => {
    expect(resolveEffectiveQuestionType('fill-blank', 'question-forms', 'writing')).toBe('short-writing');
    expect(resolveEffectiveQuestionType('mc', undefined, 'writing')).toBe('short-writing');
  });

  it('mc / short-writing requests are preserved for open topics', () => {
    expect(resolveEffectiveQuestionType('mc', 'question-forms', undefined)).toBe('mc');
    expect(resolveEffectiveQuestionType('short-writing', 'question-forms', undefined)).toBe('short-writing');
  });

  it('matching is non-deliverable → coerced to mc', () => {
    expect(resolveEffectiveQuestionType('matching', 'tenses', undefined)).toBe('mc');
    expect(resolveEffectiveQuestionType('matching', 'question-forms', undefined)).toBe('mc');
    expect(resolveEffectiveQuestionType('matching', undefined, undefined)).toBe('mc');
  });

  it('default type is mc when questionType is absent', () => {
    expect(resolveEffectiveQuestionType(undefined, 'tenses', undefined)).toBe('mc');
  });

  it('isOpenEndedGrammarTopic guards nullish input', () => {
    expect(isOpenEndedGrammarTopic(null)).toBe(false);
    expect(isOpenEndedGrammarTopic(undefined)).toBe(false);
    expect(isOpenEndedGrammarTopic('question-forms')).toBe(true);
    expect(isOpenEndedGrammarTopic('tenses')).toBe(false);
  });
});
