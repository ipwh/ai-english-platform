// ============================================
// 2026-08-29 audit: anti-fabrication for MCQ choice filtering
// When banned/time-fragment choices are filtered out (or fallback fillers are
// injected), a bare letter/number answer key referred to the AI's ORIGINAL
// list — it must be remapped by text, never left to point at an injected
// filler or a shifted choice (fabricated scoring authority).
// ============================================
import { describe, it, expect } from 'vitest';
import { normalizeGeneratedQuestions } from '../question-normalizer';
import type { GeneratedQuestion } from '../../types/generation-types';

function mcq(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    type: 'mc',
    prompt: 'Choose the best answer.',
    answer: 'C',
    choices: ['A. First option', 'B. Second option', 'C. Third option', 'D. Fourth option'],
    explanationZh: '解釋',
    explanationEn: 'Explanation',
    commonMistake: '',
    ...overrides,
  };
}

describe('question-normalizer — non-deliverable matching rejected (fail-closed)', () => {
  it('matching question → rejected, never delivered as a degraded text question', () => {
    const questions = normalizeGeneratedQuestions([
      {
        type: 'matching',
        prompt: 'Match the words to their meanings.',
        answer: 'A',
        choices: ['A. Word1', 'B. Word2'],
        explanationZh: '解釋',
        explanationEn: 'Explanation',
        commonMistake: '',
      },
    ]);
    expect(questions).toHaveLength(0);
  });

  it('matching question with empty choices → rejected', () => {
    const questions = normalizeGeneratedQuestions([
      {
        type: 'matching',
        prompt: 'Match the words.',
        answer: 'A',
        choices: [],
        explanationZh: '解釋',
        explanationEn: 'Explanation',
        commonMistake: '',
      },
    ]);
    expect(questions).toHaveLength(0);
  });
});

describe('question-normalizer anti-fabrication (choice shift)', () => {
  it('bare letter remapped by text when an earlier choice was filtered out', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Alpha', 'C. Beta', 'D. Gamma'],
        answer: 'C', // refers to "Beta" in the ORIGINAL list
      }),
    ]);
    expect(questions).toHaveLength(1);
    const q = questions[0];
    expect(q.choices).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(q.answer).toBe('B'); // remapped to the surviving "Beta" position
    expect(q.choices![1]).toBe('Beta');
  });

  it('bare letter referencing a filtered-out choice → question rejected (never a filler key)', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. Not mentioned in the passage', 'B. Alpha', 'C. Beta', 'D. Gamma'],
        answer: 'A', // referenced choice was filtered out entirely
      }),
    ]);
    expect(questions).toHaveLength(0);
  });

  it('bare number key remapped by text after filtering', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Alpha', 'C. Beta', 'D. Gamma'],
        answer: '2', // "Alpha" in the ORIGINAL list
      }),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('A');
    expect(questions[0].choices?.[0]).toBe('Alpha');
  });

  it('filler injection + bare letter → remapped to the surviving original choice, never a filler', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Beta'],
        answer: 'B', // "Beta" in the ORIGINAL list; only 1 choice survives → fillers injected
      }),
    ]);
    expect(questions).toHaveLength(1);
    const q = questions[0];
    expect(q.choices).toHaveLength(4);
    expect(q.answer).toBe('A'); // remapped to "Beta", which is now position A
    expect(q.choices![0]).toBe('Beta');
  });

  it('filler injection + bare letter referencing a banned choice → rejected', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Not mentioned in the passage'],
        answer: 'B', // referenced choice was banned → unresolvable
      }),
    ]);
    expect(questions).toHaveLength(0);
  });

  it('bare letter out of range in the ORIGINAL list → rejected', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Beta'],
        answer: 'D', // never existed, even before filtering
      }),
    ]);
    expect(questions).toHaveLength(0);
  });

  it('text answer still resolves after filtering (regression)', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Alpha', 'C. Beta', 'D. Gamma'],
        answer: 'Beta',
      }),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('B');
  });

  it('letter-prefixed text answer ("C. Beta") resolved by text after filtering', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. All of the above', 'B. Alpha', 'C. Beta', 'D. Gamma'],
        answer: 'C. Beta',
      }),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('B'); // "Beta" survived filtering at new position B
  });

  it('letter-prefixed text answer whose choice was filtered out → rejected', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. Not mentioned in the passage', 'B. Alpha', 'C. Beta', 'D. Gamma'],
        answer: 'A. Not mentioned in the passage',
      }),
    ]);
    expect(questions).toHaveLength(0);
  });

  it('no filtering → bare letter position preserved (regression)', () => {
    const questions = normalizeGeneratedQuestions([
      mcq({
        choices: ['A. First', 'B. Second', 'C. Third', 'D. Fourth'],
        answer: 'C',
      }),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('C');
  });
});
