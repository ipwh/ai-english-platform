// ============================================
// 2026-09-17 regression: one verdict authority for reading diagnostics
// ============================================
// Bug: the SAME question showed both "答案完全正確" (from the scorer) and
// "partially correct" (from the rule-based diagnostic), because quality
// signals — copying level, grammar fit — were written into the diagnostic
// `verdict` field held next to the authoritative score.
//
//   Q9  short answer "carrying capacity"  → copyingLevel 'heavy'
//                                          → errorType paraphrase_too_close
//                                          → verdict flipped to partially_correct
//   Q10 3-blank summary, all 3 correct    → answer counted as a 3-word answer
//                                          to a 1-word blank → grammar 'poor'
//                                          → verdict flipped to partially_correct
//
// Covered here: fixes A (verdict authority), B (display-type mapping),
// C (meaningful-copy guard), D (per-blank grammar fit).
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildReadingDiagnosticFeedback } from '../feedback/reading-feedback-builder';
import { createEmptyEvaluation } from '../evaluation/reading-answer-types';
import {
  answersEquivalent,
  buildEvaluation,
  countBlanks,
  detectGrammarFit,
  shouldApplyCopyPenalty,
} from '../evaluation';

function baseEvaluation(overrides: Partial<ReturnType<typeof createEmptyEvaluation>> = {}) {
  return { ...createEmptyEvaluation(1), ...overrides };
}

// ═══ A: the scorer owns the verdict ═══

describe('fix A — the scorer verdict is the only authority', () => {
  it('A1. Q9 regression: correct + heavy copying is still CORRECT', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'sentence_transformation',
      questionText:
        'According to paragraph 4, what term does the writer use for the maximum number of visitors an ecosystem can absorb before it begins to degrade?',
      studentAnswer: 'carrying capacity',
      expectedAnswer: 'carrying capacity',
      evaluation: baseEvaluation({
        isCorrect: true,
        copyingRatio: 1,
        copyingLevel: 'heavy',
        copyingDetected: true,
      }),
      isCorrect: true,
      paragraphRef: 4,
    });

    expect(fb.verdict).toBe('correct');
    expect(fb.errorType).toBeUndefined();
    expect(fb.locatingClueZh).toContain('第 4 段');
    expect(fb.improvementAdviceZh).toBeTruthy();
  });

  it('A2. Q10 regression: correct + word-form signal is still CORRECT', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'summary_cloze',
      questionText: 'Use ONE word for each blank. (i) ______ (ii) ______ (iii) ______',
      studentAnswer: 'indifference numbers carrying',
      expectedAnswer: 'indifference, numbers, carrying',
      evaluation: baseEvaluation({ isCorrect: true, grammaticalFitToPrompt: 'poor' }),
      isCorrect: true,
      paragraphRef: 4,
    });

    expect(fb.verdict).toBe('correct');
    // The signal is reported as a quality note, not as an error …
    expect(fb.errorType).toBeUndefined();
    expect(fb.qualityFlags).toContain('grammar_mismatch');
    expect(fb.qualityAdvice).toBeTruthy();
    expect(fb.qualityAdviceZh).toBeTruthy();
    // … and no error-flavoured grammar advice follows a correct verdict.
    expect(fb.grammarAdvice).toBeUndefined();
    expect(fb.paraphraseAdvice).toBeUndefined();
  });

  it('A3. partial credit from the scorer is reported as partial', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'short_answer',
      questionText: 'Explain why the parks are threatened.',
      studentAnswer: 'people',
      expectedAnswer: 'their own popularity',
      evaluation: baseEvaluation({ isCorrect: false }),
      isCorrect: false,
      isPartiallyCorrect: true,
    });

    expect(fb.verdict).toBe('partially_correct');
    expect(fb.locatingClueZh).toBeTruthy();
    expect(fb.improvementAdviceZh).toBeTruthy();
  });

  it('A4. a wrong answer keeps its diagnosed error type', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'reference',
      questionText: 'What does "it" refer to?',
      studentAnswer: 'the car',
      expectedAnswer: 'the bike',
      evaluation: baseEvaluation({ isCorrect: false }),
      isCorrect: false,
    });

    expect(fb.verdict).toBe('incorrect');
    expect(fb.errorType).toBe('wrong_reference');
  });

  it('A5. the explicit scorer verdict wins over a stale evaluation flag', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'summary_cloze',
      questionText: 'Complete the summary.',
      studentAnswer: 'wrong',
      expectedAnswer: 'right',
      evaluation: baseEvaluation({ isCorrect: true }),
      isCorrect: false,
    });

    expect(fb.verdict).toBe('incorrect');
  });
});

// ═══ B: display-type mapping no longer degrades short answers ═══

describe('fix B — extraction/matching/ordering are not sentence transformations', () => {
  const routeSource = readFileSync(
    resolve(import.meta.dirname, '../../../app/api/reading/route.ts'),
    'utf-8',
  );

  it('B1. shortAnswer/matching/sequencing/exampleFinding map to short_answer', () => {
    expect(routeSource).toContain("shortAnswer: 'short_answer'");
    expect(routeSource).toContain("matching: 'short_answer'");
    expect(routeSource).toContain("sequencing: 'short_answer'");
    expect(routeSource).toContain("exampleFinding: 'short_answer'");
    expect(routeSource).not.toContain("shortAnswer: 'sentence_transformation'");
    expect(routeSource).not.toContain("sequencing: 'sentence_transformation'");
  });

  it('B2. the unmapped fallback is no longer sentence_transformation', () => {
    expect(routeSource).not.toContain("DSE_TYPE_MAP[aiType] || 'sentence_transformation'");
    expect(routeSource).toContain("DSE_TYPE_MAP[aiType] || 'short_answer'");
  });

  it('B3. legacy rows still resolve (errorCorrectionSummary keeps the display type)', () => {
    expect(routeSource).toContain("errorCorrectionSummary: 'sentence_transformation'");
  });
});

// ═══ C: copying is only flagged when it is meaningful ═══

describe('fix C — a copying flag must be meaningful', () => {
  it('C1. a two-word key answer cannot be "too close to the passage"', () => {
    expect(shouldApplyCopyPenalty('carrying capacity')).toBe(false);
    expect(answersEquivalent('carrying capacity', 'Carrying  Capacity.')).toBe(true);
  });

  it('C2. a long answer that IS the key is not flagged', () => {
    const key = 'a broad base of general knowledge';
    expect(shouldApplyCopyPenalty(key)).toBe(true);
    expect(answersEquivalent(key, key)).toBe(true);

    const fb = buildReadingDiagnosticFeedback({
      dseType: 'short_answer',
      questionText: 'According to paragraph 1, what does the passage describe?',
      studentAnswer: key,
      expectedAnswer: key,
      evaluation: baseEvaluation({ isCorrect: true, copyingLevel: 'heavy', copyingRatio: 1 }),
      isCorrect: true,
    });

    expect(fb.verdict).toBe('correct');
    expect(fb.qualityFlags).toBeUndefined();
  });

  it('C3. a long copied answer that is correct gets a QUALITY note, not a downgrade', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'short_answer',
      questionText: 'According to paragraph 1, what do some argue?',
      studentAnswer: 'a broad base of general knowledge is no longer necessary',
      expectedAnswer: 'general knowledge is no longer necessary',
      evaluation: baseEvaluation({ isCorrect: true, copyingLevel: 'heavy', copyingRatio: 1 }),
      isCorrect: true,
    });

    expect(fb.verdict).toBe('correct');
    expect(fb.errorType).toBeUndefined();
    expect(fb.qualityFlags).toContain('paraphrase_too_close');
    expect(fb.qualityAdvice).toBeTruthy();
  });
});

// ═══ D: multi-blank items are judged per blank ═══

describe('fix D — word-form fit is judged per blank', () => {
  it('D1. countBlanks finds (i)/(ii)/(iii), underscore runs and multi-part keys', () => {
    const prompt =
      "Use ONE word for each blank. ... threatened not by (i) ______ but by ... small (ii) ______ ... about (iii) ______ capacity.";
    expect(countBlanks(prompt)).toBe(3);
    expect(countBlanks('Find ONE word from paragraph 2.')).toBe(1);
    expect(countBlanks('Complete the summary.', 'indifference, numbers, carrying')).toBe(3);
  });

  it('D2. a 3-word answer to a 3-blank item is good, not poor', () => {
    const prompt = 'Use ONE word for each blank. (i) ______ (ii) ______ (iii) ______';
    // Legacy behaviour (blankCount defaults to 1) — this is exactly what
    // produced the bogus "grammar mismatch" on a fully correct answer.
    expect(detectGrammarFit(prompt, 'indifference numbers carrying')).toBe('poor');
    expect(detectGrammarFit(prompt, 'indifference numbers carrying', { blankCount: 3 })).toBe('good');
  });

  it('D3. single-blank behaviour is unchanged', () => {
    expect(detectGrammarFit('Find ONE word from paragraph 2.', 'knowledge')).toBe('good');
    expect(detectGrammarFit('Find ONE word from paragraph 2.', 'a much longer answer')).toBe('poor');
    expect(detectGrammarFit('Complete the sentence using your own words.', 'the')).toBe('poor');
  });

  it('D4. Q10 regression: buildEvaluation no longer marks a correct multi-blank answer grammar-poor', () => {
    const prompt =
      "Complete the following summary of paragraphs 1-4. Use ONE word for each blank. " +
      "Hong Kong's country parks are threatened not by (i) ______ but by their own popularity, " +
      "a pattern called the 'tyranny of small (ii) ______'. " +
      'The writer argues we need an honest debate about (iii) ______ capacity.';

    const ev = buildEvaluation({
      isCorrect: true,
      maxScore: 3,
      studentAnswer: 'indifference numbers carrying',
      evidence: 'The country parks are threatened not by indifference but by their own popularity.',
      questionPrompt: prompt,
      expectedAnswer: 'indifference, numbers, carrying',
      dseType: 'summary_cloze',
    });

    expect(ev.isCorrect).toBe(true);
    expect(ev.grammaticalFitToPrompt).not.toBe('poor');
    expect(ev.notes.some(n => n.includes('Multi-blank item (3 blanks)'))).toBe(true);
  });
});
