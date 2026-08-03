// ============================================
// Reading Question Set Validator — Tests
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validateReadingQuestionSet,
  validateParagraphCoverage,
  validateSkillDistribution,
  validateQuestionProgression,
  validateWholeTextQuestions,
  validateDistractorQuality,
  validateQuestionWordingRisk,
  validateSummaryTransformItems,
  parseParagraphCount,
  type ReadingValidationResult,
} from '../reading-validator';
import type { DSEreadingQuestion } from '../types';

// ══════════════════════════════════════════
// Helpers: compact fixtures
// ══════════════════════════════════════════

function q(overrides: Partial<DSEreadingQuestion> & { index: number; type: DSEreadingQuestion['type'] }): DSEreadingQuestion {
  return {
    questionText: `Test question ${overrides.index}`,
    marks: 1,
    answer: 'test',
    explanationZh: '解釋',
    ...overrides,
  } as DSEreadingQuestion;
}

// ══════════════════════════════════════════
// 1. Paragraph Coverage
// ══════════════════════════════════════════

describe('validateParagraphCoverage', () => {
  it('1. balanced 4-paragraph passage → passes', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'referencing', paragraphRef: 2 }),
      q({ index: 3, type: 'inference', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 4 }),
    ];
    const result = validateParagraphCoverage(questions, 4);
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    expect(result.uncovered).toHaveLength(0);
  });

  it('2. one paragraph uncovered → fails', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 1 }),
      q({ index: 3, type: 'inference', paragraphRef: 3 }),
    ];
    const result = validateParagraphCoverage(questions, 4);
    expect(result.uncovered).toContain(2);
    expect(result.uncovered).toContain(4);
    expect(result.issues.some(i => i.code === 'READING_PARAGRAPH_UNCOVERED')).toBe(true);
  });

  it('3. one paragraph gets >40% of questions → fails', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 1 }),
      q({ index: 3, type: 'mcq', paragraphRef: 1 }),
      q({ index: 4, type: 'mcq', paragraphRef: 1 }),
      q({ index: 5, type: 'inference', paragraphRef: 2 }),
      q({ index: 6, type: 'referencing', paragraphRef: 3 }),
      q({ index: 7, type: 'vocabularyInContext', paragraphRef: 4 }),
    ];
    const result = validateParagraphCoverage(questions, 4);
    // 4/7 = 57% > 40%
    expect(result.issues.some(i => i.code === 'READING_PARAGRAPH_OVERCONCENTRATED')).toBe(true);
  });
});

// ══════════════════════════════════════════
// 2. Skill Distribution
// ══════════════════════════════════════════

describe('validateSkillDistribution', () => {
  it('4. too many factual questions → fails', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'trueFalseNG', paragraphRef: 1 }),
      q({ index: 3, type: 'mcq', paragraphRef: 2 }),
      q({ index: 4, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 5, type: 'mcq', paragraphRef: 3 }),
      q({ index: 6, type: 'trueFalseNG', paragraphRef: 3 }),
      q({ index: 7, type: 'mcq', paragraphRef: 4 }),
      q({ index: 8, type: 'shortAnswer', paragraphRef: 4 }),
    ];
    const result = validateSkillDistribution(questions, 4);
    expect(result.issues.some(i => i.code === 'READING_FACTUAL_RATIO_TOO_HIGH')).toBe(true);
  });

  it('5. no higher-order / no whole-text → fails for 4+ paragraph passage', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'trueFalseNG', paragraphRef: 2 }),
      q({ index: 3, type: 'referencing', paragraphRef: 2 }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 5, type: 'inference', paragraphRef: 3 }),
      q({ index: 6, type: 'mcq', paragraphRef: 4 }),
      q({ index: 7, type: 'shortAnswer', paragraphRef: 4 }),
    ];
    const result = validateSkillDistribution(questions, 4);
    expect(result.issues.some(i => i.code === 'READING_HIGHER_ORDER_TOO_LOW')).toBe(true);
    expect(result.issues.some(i => i.code === 'READING_MISSING_HIGHER_ORDER')).toBe(true);
  });

  it('6. missing required families → errors', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 2 }),
      q({ index: 3, type: 'mcq', paragraphRef: 3 }),
      q({ index: 4, type: 'trueFalseNG', paragraphRef: 4 }),
    ];
    const result = validateSkillDistribution(questions, 4);
    expect(result.issues.some(i => i.code === 'READING_MISSING_REFERENCE')).toBe(true);
    expect(result.issues.some(i => i.code === 'READING_MISSING_VOCABULARY')).toBe(true);
    expect(result.issues.some(i => i.code === 'READING_MISSING_INFERENCE')).toBe(true);
  });
});

// ══════════════════════════════════════════
// 3. Question Progression
// ══════════════════════════════════════════

describe('validateQuestionProgression', () => {
  it('7. late questions all factual → warning', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'referencing', paragraphRef: 2 }),
      q({ index: 3, type: 'inference', paragraphRef: 2 }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 5, type: 'toneAttitude', paragraphRef: 4 }),
      q({ index: 6, type: 'mcq', paragraphRef: 1 }),
      q({ index: 7, type: 'trueFalseNG', paragraphRef: 2 }),
      q({ index: 8, type: 'mcq', paragraphRef: 3 }),
    ];
    const result = validateQuestionProgression(questions);
    expect(result.some(i => i.code === 'READING_POOR_LATE_STAGE_PROGRESS')).toBe(true);
  });

  it('8. whole-text question too early → warning', () => {
    const questions = [
      q({ index: 1, type: 'mcq', wholeText: true }),
      q({ index: 2, type: 'mcq', paragraphRef: 1 }),
      q({ index: 3, type: 'referencing', paragraphRef: 2 }),
      q({ index: 4, type: 'inference', paragraphRef: 3 }),
      q({ index: 5, type: 'toneAttitude', paragraphRef: 4 }),
      q({ index: 6, type: 'summaryCloze' }),
    ];
    const result = validateQuestionProgression(questions);
    expect(result.some(i => i.code === 'READING_WHOLE_TEXT_TOO_EARLY')).toBe(true);
  });
});

// ══════════════════════════════════════════
// 4. Whole-Text / Cross-Paragraph Validity
// ══════════════════════════════════════════

describe('validateWholeTextQuestions', () => {
  it('9. fake whole-text question that only targets paragraph 2 → fails', () => {
    const questions = [
      q({ index: 1, type: 'mcq', wholeText: true, questionText: 'According to paragraph 2, what is X?' }),
      q({ index: 2, type: 'referencing', paragraphRef: 3 }),
      q({ index: 3, type: 'inference', paragraphRef: 4 }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 4 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 1 }),
      q({ index: 6, type: 'summaryCloze' }),
    ];
    const result = validateWholeTextQuestions(questions, 4);
    expect(result.some(i => i.code === 'READING_INVALID_WHOLE_TEXT_LABEL')).toBe(true);
  });

  it('10. valid whole-text question → passes', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'referencing', paragraphRef: 2 }),
      q({ index: 3, type: 'inference', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 4 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 1 }),
      q({ index: 6, type: 'mcq', wholeText: true, questionText: 'What is the overall message of the passage?' }),
    ];
    const result = validateWholeTextQuestions(questions, 4);
    expect(result.filter(i => i.severity === 'error')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════
// 5. MC Distractor Quality
// ══════════════════════════════════════════

describe('validateDistractorQuality', () => {
  it('11. MCQ with duplicate distractors → fails', () => {
    const questions = [
      q({ index: 1, type: 'mcq', choices: ['A. hello', 'B. world', 'C. hello', 'D. test'], answer: 'B' }),
    ];
    const result = validateDistractorQuality(questions);
    expect(result.some(i => i.code === 'READING_DUPLICATE_CHOICES')).toBe(true);
  });

  it('12. MCQ with "all of the above" → fails', () => {
    const questions = [
      q({ index: 1, type: 'mcq', choices: ['A. option one', 'B. option two', 'C. option three', 'D. All of the above'], answer: 'A' }),
    ];
    const result = validateDistractorQuality(questions);
    expect(result.some(i => i.code === 'READING_MC_BANNED_PATTERN')).toBe(true);
  });

  it('13. valid MCQ with 4 good distractors → passes', () => {
    const questions = [
      q({ index: 1, type: 'mcq', choices: [
        'A. The smartphone is primarily a communication device.',
        'B. The smartphone replaces multiple traditional tools.',
        'C. The smartphone is expensive to maintain.',
        'D. The smartphone requires constant charging.',
      ], answer: 'B' }),
    ];
    const result = validateDistractorQuality(questions);
    expect(result.filter(i => i.severity === 'error')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════
// 6. Answer Giveaway
// ══════════════════════════════════════════

describe('validateQuestionWordingRisk', () => {
  it('14. vocabulary question that gives away the answer → warning', () => {
    const questions = [
      q({
        index: 1, type: 'vocabularyInContext',
        questionText: 'What does "venerates" mean as used in the passage?',
        targetPhrase: 'venerates',
        answer: 'respects or honors',
        paragraphRef: 1,
      }),
    ];
    const result = validateQuestionWordingRisk(questions);
    expect(result.some(i => i.code === 'READING_ANSWER_GIVEAWAY')).toBe(true);
  });

  it('15. normal vocabulary question → passes', () => {
    const questions = [
      q({
        index: 1, type: 'vocabularyInContext',
        questionText: 'What does the word in paragraph 1 mean as used in the passage?',
        targetPhrase: 'venerates',
        answer: 'respects highly',
        paragraphRef: 1,
      }),
    ];
    const result = validateQuestionWordingRisk(questions);
    expect(result.filter(i => i.severity === 'error')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════
// 7. Summary / Transformation
// ══════════════════════════════════════════

describe('validateSummaryTransformItems', () => {
  it('16. summary cloze with 1 blank → too trivial warning', () => {
    const questions = [
      q({ index: 1, type: 'summaryCloze', marks: 1, questionText: 'Complete: The future is _____.', answer: 'uncertain' }),
    ];
    const result = validateSummaryTransformItems(questions);
    expect(result.some(i => i.code === 'READING_SUMMARY_TOO_TRIVIAL')).toBe(true);
  });
});

// ══════════════════════════════════════════
// 8. Top-Level Validator
// ══════════════════════════════════════════

describe('validateReadingQuestionSet', () => {
  it('17. balanced 4-paragraph set → isValid=true', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'referencing', paragraphRef: 2 }),
      q({ index: 3, type: 'vocabularyInContext', paragraphRef: 2 }),
      q({ index: 4, type: 'inference', paragraphRef: 3 }),
      q({ index: 5, type: 'trueFalseNG', paragraphRef: 3 }),
      q({ index: 6, type: 'toneAttitude', paragraphRef: 4, questionText: 'What is the writer\'s attitude toward the proposal?' }),
      q({ index: 7, type: 'summaryCloze', questionText: 'Complete the summary with ONE word for each gap: The writer believes (i)_____ is essential for (ii)_____ and that without it (iii)_____.', marks: 3 }),
    ];
    const result = validateReadingQuestionSet(questions, { paragraphCount: 4 });
    expect(result.isValid).toBe(true);
  });

  it('18. set with uncovered paragraph → isValid=false', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 1 }),
      q({ index: 3, type: 'inference', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 3 }),
    ];
    const result = validateReadingQuestionSet(questions, { paragraphCount: 4 });
    expect(result.isValid).toBe(false);
    expect(result.metrics.uncoveredParagraphs).toContain(2);
    expect(result.metrics.uncoveredParagraphs).toContain(4);
  });

  it('19. metrics are populated correctly', () => {
    const questions = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'referencing', paragraphRef: 2 }),
      q({ index: 3, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 4, type: 'inference', paragraphRef: 4 }),
      q({ index: 5, type: 'toneAttitude', paragraphRef: 4 }),
    ];
    const result = validateReadingQuestionSet(questions, { paragraphCount: 4 });
    expect(result.metrics.totalQuestions).toBe(5);
    expect(result.metrics.paragraphCount).toBe(4);
    expect(result.metrics.referenceCount).toBe(1);
    expect(result.metrics.vocabularyCount).toBe(1);
    expect(result.metrics.inferenceCount).toBe(1);
    expect(result.metrics.toneCount).toBe(1);
    expect(result.metrics.factualCount).toBe(1);
  });

  it('20. parseParagraphCount from content', () => {
    expect(parseParagraphCount('[Paragraph 1] text\n\n[Paragraph 2] text\n\n[Paragraph 3] text')).toBe(3);
    expect(parseParagraphCount('[Paragraph 1] text\n\n[Paragraph 2] text\n\n[Paragraph 3] text\n\n[Paragraph 4] text')).toBe(4);
    expect(parseParagraphCount('no markers here just text')).toBe(1);
  });
});
