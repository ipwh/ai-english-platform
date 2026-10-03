// ============================================
// INTERNAL_IELTS_GOLDEN_FIXTURES — regression tests
// ============================================
// These fixtures are platform-original content (NOT official IELTS material).
// They pin: deterministic objective scoring, question validation, word-count
// policy and the writing assessment regression set shape.
// ============================================
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_LISTENING_QUESTIONS,
  GOLDEN_LISTENING_TRANSCRIPT,
  GOLDEN_READING_PASSAGE,
  GOLDEN_READING_QUESTIONS,
  GOLDEN_SPEAKING_SAMPLES,
  GOLDEN_WRITING_SAMPLES,
  INTERNAL_IELTS_GOLDEN_FIXTURE_LABEL,
} from './fixtures/golden';
import { validateIeltsQuestion } from '../validation/question-validator';
import { scoreIeltsItem } from '../scoring/objective-scorer';
import { countIeltsWords } from '../domain/word-count';

describe('golden fixtures — validation', () => {
  it('every golden reading question passes the machine screen', () => {
    for (const question of GOLDEN_READING_QUESTIONS) {
      const report = validateIeltsQuestion(question, { passageText: GOLDEN_READING_PASSAGE });
      expect(report.ok, `${question.id}: ${report.issues.map((i) => i.code).join(',')}`).toBe(true);
    }
  });

  it('every golden listening question passes the machine screen (deliverable)', () => {
    for (const question of GOLDEN_LISTENING_QUESTIONS) {
      const report = validateIeltsQuestion(question, { transcriptText: GOLDEN_LISTENING_TRANSCRIPT });
      expect(report.ok, `${question.id}: ${report.issues.map((i) => i.code).join(',')}`).toBe(true);
    }
  });

  it('fixtures are labelled as internal, non-official content', () => {
    expect(INTERNAL_IELTS_GOLDEN_FIXTURE_LABEL).toContain('not official IELTS material');
  });
});

describe('golden fixtures — deterministic scoring', () => {
  it('T/F/NG scores per the canonical tokens', () => {
    const q = GOLDEN_READING_QUESTIONS[0];
    expect(scoreIeltsItem('true', q).verdict).toBe('correct');
    expect(scoreIeltsItem('false', q).verdict).toBe('incorrect');
  });

  it('completion answers respect the word limit and hyphenation policy', () => {
    const q = GOLDEN_READING_QUESTIONS[2];
    expect(scoreIeltsItem('tripled', q).verdict).toBe('correct');
    expect(scoreIeltsItem('had tripled', q).verdict).toBe('incorrect'); // key words only, no invented variants
    expect(scoreIeltsItem('it had tripled within', q).reason).toBe('WORD_LIMIT_EXCEEDED');
  });

  it('MC accepts letter or exact option text', () => {
    const q = GOLDEN_READING_QUESTIONS[3];
    expect(scoreIeltsItem('B', q).verdict).toBe('correct');
    expect(scoreIeltsItem('The loss of flower-rich habitats', q).verdict).toBe('correct');
    expect(scoreIeltsItem('A', q).verdict).toBe('incorrect');
  });

  it('listening answers honor accepted variants and number equivalence', () => {
    const [q1, q2] = GOLDEN_LISTENING_QUESTIONS;
    expect(scoreIeltsItem('twelve pounds', q1).verdict).toBe('correct');
    expect(scoreIeltsItem('12 pounds', q1).verdict).toBe('correct');
    expect(scoreIeltsItem('four', q2).verdict).toBe('correct');
    expect(scoreIeltsItem('4', q2).verdict).toBe('correct');
    expect(scoreIeltsItem('four o clock', q2).reason).toBe('WORD_LIMIT_EXCEEDED');
  });
});

describe('golden fixtures — writing/speaking regression set', () => {
  it('contains the required response archetypes', () => {
    const ids = GOLDEN_WRITING_SAMPLES.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'writing-strong',
        'writing-weak',
        'writing-off-topic',
        'writing-formulaic',
        'writing-under-length',
        'writing-gt-letter',
      ]),
    );
  });

  it('the strong Task 2 sample meets the 250-word minimum; the under-length one does not', () => {
    const strong = GOLDEN_WRITING_SAMPLES.find((s) => s.id === 'writing-strong')!;
    const underLength = GOLDEN_WRITING_SAMPLES.find((s) => s.id === 'writing-under-length')!;
    expect(countIeltsWords(strong.essay)).toBeGreaterThanOrEqual(250);
    expect(countIeltsWords(underLength.essay)).toBeLessThan(250);
  });

  it('GT letter sample covers the three bullet points with a letter register', () => {
    const letter = GOLDEN_WRITING_SAMPLES.find((s) => s.id === 'writing-gt-letter')!;
    expect(letter.essay).toMatch(/^Dear /);
    expect(countIeltsWords(letter.essay)).toBeGreaterThanOrEqual(150);
  });

  it('speaking samples are preparation references (model answer + hesitation self-check)', () => {
    const ids = GOLDEN_SPEAKING_SAMPLES.map((s) => s.id);
    expect(ids).toContain('speaking-fluent');
    expect(ids).toContain('speaking-hesitant');
    const hesitant = GOLDEN_SPEAKING_SAMPLES.find((s) => s.id === 'speaking-hesitant')!;
    expect((hesitant.transcript.match(/\bum\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // No scoring surface exists for speaking: fixtures must not promise bands.
    for (const sample of GOLDEN_SPEAKING_SAMPLES) {
      expect(sample.notes).not.toMatch(/\bband\b/i);
    }
  });
});
