// ============================================
// IELTS Word Counting — policy tests (§14 of the phase spec)
// ============================================
import { describe, expect, it } from 'vitest';
import {
  checkWritingLength,
  countIeltsWords,
  validateWordLimit,
} from '../domain/word-count';

describe('countIeltsWords — official-adjacent policy', () => {
  it('counts simple words', () => {
    expect(countIeltsWords('The quick brown fox')).toBe(4);
  });

  it('hyphenated words count as SINGLE words (official rule)', () => {
    expect(countIeltsWords('check-in')).toBe(1);
    expect(countIeltsWords('a well-known problem')).toBe(3);
    expect(countIeltsWords('state-of-the-art design')).toBe(2);
  });

  it('contractions count as one word', () => {
    expect(countIeltsWords("it's they're don't")).toBe(3);
  });

  it('numbers count as one word (figures or words)', () => {
    expect(countIeltsWords('15')).toBe(1);
    expect(countIeltsWords('1,500 people')).toBe(2);
    expect(countIeltsWords('fifteen')).toBe(1);
  });

  it('abbreviations count as one word; internal dots do not split', () => {
    expect(countIeltsWords('U.S.A.')).toBe(1);
    expect(countIeltsWords('e.g. this')).toBe(2);
  });

  it('does not use naive split(" ") semantics', () => {
    expect(countIeltsWords('word  with   spaces')).toBe(3);
    expect(countIeltsWords(' leading and trailing ')).toBe(3);
  });

  it('Unicode whitespace (NBSP etc.) separates words', () => {
    expect(countIeltsWords('hello\u00A0world')).toBe(2);
    expect(countIeltsWords('hello\u2003world')).toBe(2);
  });

  it('Unicode punctuation-only tokens are not words', () => {
    expect(countIeltsWords('word — word')).toBe(2);
    expect(countIeltsWords('word …')).toBe(1);
  });

  it('handles empty/nullish input', () => {
    expect(countIeltsWords('')).toBe(0);
    expect(countIeltsWords(null)).toBe(0);
    expect(countIeltsWords(undefined)).toBe(0);
    expect(countIeltsWords('   ')).toBe(0);
  });

  it('counts non-Latin tokens', () => {
    expect(countIeltsWords('中文 英文')).toBe(2);
  });
});

describe('validateWordLimit — official "lose the mark" semantics', () => {
  it('accepts an answer within the limit', () => {
    const result = validateWordLimit('two words', { maxWords: 2 });
    expect(result.ok).toBe(true);
    expect(result.limitExceeded).toBe(false);
    expect(result.wordCount).toBe(2);
  });

  it('rejects an over-limit answer', () => {
    const result = validateWordLimit('this is three words', { maxWords: 2 });
    expect(result.ok).toBe(false);
    expect(result.limitExceeded).toBe(true);
  });

  it('hyphenated words do not trigger false limit breaches', () => {
    const result = validateWordLimit('check-in', { maxWords: 1 });
    expect(result.ok).toBe(true);
    expect(result.wordCount).toBe(1);
  });

  it('flags numeric-only answers when numbers are disallowed', () => {
    const result = validateWordLimit('15', { maxWords: 2, allowsNumber: false });
    expect(result.ok).toBe(false);
    expect(result.numberNotAllowed).toBe(true);
  });

  it('allows numbers by default (allowsNumber unspecified)', () => {
    const result = validateWordLimit('15', { maxWords: 2 });
    expect(result.ok).toBe(true);
  });

  it('no limit rule → always ok', () => {
    expect(validateWordLimit('anything at all', null).ok).toBe(true);
  });
});

describe('checkWritingLength', () => {
  it('detects below-minimum Task 1 (150) and Task 2 (250)', () => {
    const tasks1 = checkWritingLength('short text', 'academic_task1');
    expect(tasks1.minimum).toBe(150);
    expect(tasks1.belowMinimum).toBe(true);

    const task2 = checkWritingLength(Array(260).fill('word').join(' '), 'general_task2');
    expect(task2.minimum).toBe(250);
    expect(task2.belowMinimum).toBe(false);
  });

  it('exact boundaries: 149/150 and 249/250 (audit 2026-10-03; hyphenation-aware)', () => {
    const w = (n: number) => Array(n).fill('word').join(' ');
    expect(checkWritingLength(w(149), 'academic_task1').belowMinimum).toBe(true);
    expect(checkWritingLength(w(150), 'academic_task1').belowMinimum).toBe(false);
    expect(checkWritingLength(w(249), 'general_task2').belowMinimum).toBe(true);
    expect(checkWritingLength(w(250), 'general_task2').belowMinimum).toBe(false);
    // Hyphenated tokens count as ONE word — 150 hyphenated tokens still meet the minimum.
    expect(checkWritingLength(Array(150).fill('well-known').join(' '), 'academic_task1').belowMinimum).toBe(
      false,
    );
  });
});
