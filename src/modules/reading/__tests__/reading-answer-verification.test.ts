import { describe, expect, it } from 'vitest';
import {
  verifyReadingQuestionsForDelivery,
  type ReadingDeliveryQuestion,
} from '../services/reading-answer-verification';

const passage = 'The school library extended its opening hours after students requested more quiet study space.';

function verifier(blindAnswer: string, soundness = 'ok') {
  return async () => ({
    verdicts: [{ index: 1, blindAnswer, soundness, reason: '' }],
  });
}

describe('verifyReadingQuestionsForDelivery', () => {
  it('keeps a verified MCQ and preserves its original server scoring key', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'mc',
      dseType: 'multiple_choice',
      question: 'Why did the library extend its opening hours?',
      choices: ['To sell books', 'Students requested more study space', 'To hire teachers', 'The building was smaller'],
      answer: 'Students requested more study space',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('B') });

    expect(result.dropped).toEqual([]);
    expect(result.kept).toEqual(questions);
    expect(result.kept[0].answer).toBe('Students requested more study space');
  });

  it('accepts the valid three-choice T/F/NG contract and normalizes a text key only for verification', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'mc',
      dseType: 'true_false_not_given',
      question: 'The passage says the library was open all night. True, False, or Not Given?',
      choices: ['True', 'False', 'Not Given'],
      answer: 'Not Given',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('C') });

    expect(result.dropped).toEqual([]);
    expect(result.kept[0].answer).toBe('Not Given');
  });

  it('drops an MCQ whose independent blind solve rejects the keyed answer', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'mc',
      dseType: 'multiple_choice',
      question: 'Why did the library extend its opening hours?',
      choices: ['To sell books', 'Students requested more study space', 'To hire teachers', 'The building was smaller'],
      answer: 'A',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('B') });

    expect(result.kept).toEqual([]);
    expect(result.dropped[0].reasons.join(' ')).toContain('覆核 B／題目答案鍵 A');
  });

  it('drops an independently mismatched summary cloze key', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'short-answer',
      dseType: 'summary_cloze',
      question: 'Complete the summary: Students wanted more _____ study space.',
      answer: 'quiet',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('private') });

    expect(result.kept).toEqual([]);
    expect(result.dropped[0].reasons.join(' ')).toContain('覆核「private」／題目答案鍵「quiet」');
  });

  it('drops an independently mismatched sequencing key', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'short-answer',
      dseType: 'short_answer',
      question: 'Arrange the events in the correct order.',
      answer: 'B,A,C',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('A,B,C') });

    expect(result.kept).toEqual([]);
    expect(result.dropped[0].reasons.join(' ')).toContain('覆核「A,B,C」／題目答案鍵「B,A,C」');
  });

  // ============================================
  // 2026-09-21：覆蓋面擴大 + 語意題寬鬆比對
  // ============================================

  it('now verifies AI-scored short answers (reference / inference / vocabulary_in_context)', async () => {
    // 舊碼只覆核 mc / summary_cloze / sentence_transformation / 含逗號排序題，
    // 這些題型的 AI 答案鍵從未 blind-solve。
    const mismatched: ReadingDeliveryQuestion[] = [{
      type: 'short-answer',
      dseType: 'inference',
      question: 'What can be inferred about students\u2019 study habits?',
      answer: 'They prefer a quiet environment',
    }];

    const dropped = await verifyReadingQuestionsForDelivery(mismatched, passage, { verify: verifier('They enjoy sports') });

    expect(dropped.dropped).toHaveLength(1);
    expect(dropped.dropped[0].reasons.join(' ')).toContain('獨立覆核得出不同答案');
  });

  it('accepts a semantic short answer whose wording differs but content words overlap', async () => {
    // 答案鍵是「參考答案」，逐字相等會大量誤丟 → 語意題採內容詞重疊。
    const same = [{
      type: 'short-answer',
      dseType: 'reference',
      question: 'What does "it" refer to?',
      answer: 'the school library',
    }];

    const result = await verifyReadingQuestionsForDelivery(same, passage, { verify: verifier('the school library building') });

    expect(result.dropped).toEqual([]);
    expect(result.kept).toHaveLength(1);
  });

  it('still requires exact equality for deterministic cloze keys', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'short-answer',
      dseType: 'summary_cloze',
      question: 'Complete the summary: Students wanted more _____ study space.',
      answer: 'quiet',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('quietly') });

    expect(result.kept).toEqual([]);
  });

  it('does not verify unknown question types (fail-safe, unchanged behaviour)', async () => {
    const questions: ReadingDeliveryQuestion[] = [{
      type: 'short-answer',
      dseType: 'some_future_type',
      question: 'Explain your view.',
      answer: 'anything',
    }];

    const result = await verifyReadingQuestionsForDelivery(questions, passage, { verify: verifier('totally different') });

    expect(result.dropped).toEqual([]);
    expect(result.kept).toHaveLength(1);
  });
});