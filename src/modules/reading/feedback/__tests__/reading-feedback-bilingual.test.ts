// ============================================
// 2026-08-30 audit — bilingual reading diagnostic feedback
// Every diagnostic branch must carry a curated 繁體中文 counterpart.
// ============================================

import { describe, expect, it } from 'vitest';
import { buildReadingDiagnosticFeedback } from '../reading-feedback-builder';
import { createEmptyEvaluation } from '../../evaluation/reading-answer-types';

function baseEvaluation(overrides: Partial<ReturnType<typeof createEmptyEvaluation>> = {}) {
  return { ...createEmptyEvaluation(2), ...overrides };
}

describe('buildReadingDiagnosticFeedback — zh content parity', () => {
  it('short answer incorrect: zh clue + advice accompany the EN content', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'short_answer',
      questionText: 'What is the main cause?',
      studentAnswer: 'water',
      expectedAnswer: 'pollution',
      evaluation: baseEvaluation({ isCorrect: false, completeness: 'partial', paraphraseQuality: 'limited' }),
      paragraphRef: 2,
    });
    expect(fb.skillTarget).toBeTruthy();
    expect(fb.skillTargetZh).toBe('短答 — 定位與改寫證據');
    expect(fb.locatingClueZh).toContain('第 2 段');
    expect(fb.improvementAdviceZh).toBeTruthy();
  });

  it('reference wrong: zh evidence summary quotes both answers', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'reference',
      questionText: 'What does "it" refer to?',
      studentAnswer: 'the car',
      expectedAnswer: 'the bike',
      evaluation: baseEvaluation({ isCorrect: false }),
    });
    expect(fb.skillTargetZh).toBe('代詞指涉 — 代名詞／前詞解析');
    expect(fb.evidenceSummaryZh).toContain('「the bike」');
    expect(fb.evidenceSummaryZh).toContain('「the car」');
  });

  it('multiple choice correct: zh skill label + advice', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'multiple_choice',
      questionText: 'Choose the best answer.',
      studentAnswer: 'B',
      expectedAnswer: 'B',
      choices: ['A', 'B', 'C', 'D'],
      evaluation: baseEvaluation({ isCorrect: true }),
    });
    expect(fb.verdict).toBe('correct');
    expect(fb.skillTargetZh).toBe('閱讀理解 — 選擇題');
    expect(fb.improvementAdviceZh).toBe('你的答案符合篇章內容。');
  });

  it('multiple choice incorrect: zh distractor notes accompany EN notes', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'multiple_choice',
      questionText: 'Choose the best answer.',
      studentAnswer: 'C',
      expectedAnswer: 'B',
      choices: ['A', 'B', 'C', 'D'],
      evaluation: baseEvaluation({ isCorrect: false }),
    });
    expect(fb.errorType).toBe('distractor_trap');
    expect(fb.distractorNotes?.length).toBe(2);
    expect(fb.distractorNotesZh?.length).toBe(2);
    expect(fb.distractorNotesZh?.[0]).toContain('干擾項');
  });

  it('tone vague: zh paraphrase advice present', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'tone_attitude',
      questionText: 'What is the writer\'s tone?',
      studentAnswer: 'neutral',
      expectedAnswer: 'critical',
      evaluation: baseEvaluation({ isCorrect: false, warnings: ['tone label is vague'] }),
    });
    expect(fb.errorType).toBe('tone_too_vague');
    expect(fb.paraphraseAdviceZh).toContain('語調');
    expect(fb.skillTargetZh).toBe('語調／態度 — 作者的立場與目的');
  });

  it('cloze grammar mismatch: zh grammar advice present', () => {
    const fb = buildReadingDiagnosticFeedback({
      dseType: 'summary_cloze',
      questionText: 'Complete the summary.',
      studentAnswer: 'reduce',
      expectedAnswer: 'reducing',
      evaluation: baseEvaluation({ isCorrect: false, grammaticalFitToPrompt: 'poor' }),
      paragraphRef: 3,
    });
    expect(fb.errorType).toBe('grammar_mismatch');
    expect(fb.grammarAdviceZh).toContain('詞形');
    expect(fb.locatingClueZh).toContain('第 3 段');
  });

  it('every produced branch has a non-empty zh skill label', () => {
    const types = ['short_answer', 'reference', 'vocabulary_in_context', 'inference', 'tone_attitude', 'multiple_choice', 'true_false_not_given', 'summary_cloze', 'sentence_transformation'];
    for (const dseType of types) {
      const wrong = buildReadingDiagnosticFeedback({
        dseType,
        questionText: 'Question',
        studentAnswer: 'x',
        expectedAnswer: 'y',
        choices: ['x', 'y'],
        evaluation: baseEvaluation({ isCorrect: false, warnings: ['vague'] }),
      });
      expect(wrong.skillTargetZh).toBeTruthy();
      const right = buildReadingDiagnosticFeedback({
        dseType,
        questionText: 'Question',
        studentAnswer: 'y',
        expectedAnswer: 'y',
        choices: ['x', 'y'],
        evaluation: baseEvaluation({ isCorrect: true }),
      });
      expect(right.skillTargetZh).toBeTruthy();
      expect(right.improvementAdviceZh).toBeTruthy();
    }
  });
});
