// ============================================
// Phase 4B: Skill Boundaries & Higher-Order Reasoning Tests (16 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validateQuestionSetBlueprint,
  mapTypeToSkillCategory,
  READING_SKILL_BOUNDARIES,
  SKILL_DISTRIBUTION,
} from '@/modules/ai/prompts/reading/types';
import type { DSEreadingQuestion, ReadingSkillCategory } from '@/modules/ai/prompts/reading/types';

/** Helper to create a minimal question */
function q(overrides: Partial<DSEreadingQuestion> = {}): DSEreadingQuestion {
  return {
    index: 1,
    type: 'mcq',
    questionText: 'What is the main idea?',
    marks: 1,
    answer: 'The main idea',
    explanationZh: '解釋',
    ...overrides,
  };
}

// ══════════════════════════════════════════
// A: Skill Category Mapping
// ══════════════════════════════════════════

describe('Phase 4B-A: Skill Category Mapping', () => {
  it('1. maps toneAttitude to toneStance category', () => {
    expect(mapTypeToSkillCategory('toneAttitude')).toBe('toneStance');
  });

  it('2. maps inference to inference category (not crossParagraph)', () => {
    expect(mapTypeToSkillCategory('inference')).toBe('inference');
  });

  it('3. maps sequencing to crossParagraph category', () => {
    expect(mapTypeToSkillCategory('sequencing')).toBe('crossParagraph');
  });

  it('4. maps mcq to factual category', () => {
    expect(mapTypeToSkillCategory('mcq')).toBe('factual');
  });

  it('5. maps summaryCloze to summaryTransform category', () => {
    expect(mapTypeToSkillCategory('summaryCloze')).toBe('summaryTransform');
  });

  it('6. maps referencing to reference category', () => {
    expect(mapTypeToSkillCategory('referencing')).toBe('reference');
  });
});

// ══════════════════════════════════════════
// B: Skill Boundary Definitions
// ══════════════════════════════════════════

describe('Phase 4B-B: Skill Boundary Definitions', () => {
  it('7. wholeText skill requires ≥3 paragraph span', () => {
    const boundary = READING_SKILL_BOUNDARIES.wholeText;
    expect(boundary.minParagraphSpan).toBeGreaterThanOrEqual(3);
  });

  it('8. crossParagraph requires ≥2 paragraph span', () => {
    const boundary = READING_SKILL_BOUNDARIES.crossParagraph;
    expect(boundary.minParagraphSpan).toBeGreaterThanOrEqual(2);
  });

  it('9. toneStance distinctFrom mentions word choice, hedging, or structure', () => {
    const boundary = READING_SKILL_BOUNDARIES.toneStance;
    expect(boundary.distinctFrom.toLowerCase()).toMatch(/word choice|hedging|contrast|structure/);
  });

  it('10. wholeText notToBeConfusedWith includes summaryTransform', () => {
    const boundary = READING_SKILL_BOUNDARIES.wholeText;
    expect(boundary.notToBeConfusedWith).toContain('summaryTransform');
  });

  it('11. every skill category has a defined boundary', () => {
    const categories: ReadingSkillCategory[] = [
      'factual', 'reference', 'vocabulary', 'inference',
      'crossParagraph', 'wholeText', 'toneStance',
      'paragraphFunction', 'mainIdea', 'summaryTransform',
    ];
    for (const cat of categories) {
      expect(READING_SKILL_BOUNDARIES[cat]).toBeDefined();
      expect(READING_SKILL_BOUNDARIES[cat].category).toBe(cat);
    }
  });
});

// ══════════════════════════════════════════
// C: Validator — Skill Overload Detection
// ══════════════════════════════════════════

describe('Phase 4B-C: Validator — Skill Overload Detection', () => {
  it('12. too many factual items triggers SKILL_OVERLOAD_FACTUAL', () => {
    // 7 questions, all mcq (factual) = 100% factual > 55%
    const questions: DSEreadingQuestion[] = Array.from({ length: 7 }, (_, i) =>
      q({ index: i + 1, type: 'mcq', paragraphRef: (i % 3) + 1 }),
    );
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const factualOverload = check.issues.find(i => i.code === 'SKILL_OVERLOAD_FACTUAL');
    expect(factualOverload).toBeDefined();
    expect(factualOverload!.severity).toBe('warning');
  });

  it('13. balanced set does NOT trigger SKILL_OVERLOAD_FACTUAL', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 3, type: 'referencing', paragraphRef: 2 }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 5, type: 'inference' }),
      q({ index: 6, type: 'toneAttitude' }),
      q({ index: 7, type: 'summaryCloze', paragraphRef: 3 }),
      q({ index: 8, type: 'mcq' }), // whole-text (no paragraphRef)
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    const factualOverload = check.issues.find(i => i.code === 'SKILL_OVERLOAD_FACTUAL');
    // 3 factual out of 8 = 37.5% — below 55%
    expect(factualOverload).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// D: Validator — Higher-Order Skill Ratio
// ══════════════════════════════════════════

describe('Phase 4B-D: Validator — Higher-Order Skill Ratio', () => {
  it('14. low higher-order ratio triggers SKILL_LOW_HIGHER_ORDER', () => {
    // 8 questions, all factual — 0% higher order
    const questions: DSEreadingQuestion[] = Array.from({ length: 8 }, (_, i) =>
      q({ index: i + 1, type: 'mcq', paragraphRef: (i % 4) + 1 }),
    );
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const lowHO = check.issues.find(i => i.code === 'SKILL_LOW_HIGHER_ORDER');
    expect(lowHO).toBeDefined();
    expect(lowHO!.severity).toBe('warning');
  });

  it('15. sufficient higher-order does NOT trigger SKILL_LOW_HIGHER_ORDER', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 3, type: 'mcq', paragraphRef: 3 }),
      q({ index: 4, type: 'mcq', paragraphRef: 4 }),
      q({ index: 5, type: 'toneAttitude',
        questionText: 'What is the writer\'s attitude toward the issue?',
        answer: 'Skeptical but cautiously open',
      }),          // higher-order (toneStance)
      q({ index: 6, type: 'toneAttitude',
        questionText: 'What is the tone of paragraph 4?',
        answer: 'Ironic and self-deprecating',
      }),          // higher-order (toneStance)
      q({ index: 7, type: 'mcq', paragraphRef: 1 }),
      q({ index: 8, type: 'mcq', paragraphRef: 2 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const lowHO = check.issues.find(i => i.code === 'SKILL_LOW_HIGHER_ORDER');
    // 2 toneStance out of 8 = 25% ≥ 20%
    expect(lowHO).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// E: Validator — Skill Repetition
// ══════════════════════════════════════════

describe('Phase 4B-E: Validator — Skill Repetition', () => {
  it('16. same skill exceeds 40% triggers SKILL_REPETITION', () => {
    // 8 questions, 6 are shortAnswer (factual) = 6/8 = 75% > 40%
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'shortAnswer', paragraphRef: 1 }),
      q({ index: 2, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 3, type: 'shortAnswer', paragraphRef: 3 }),
      q({ index: 4, type: 'shortAnswer', paragraphRef: 4 }),
      q({ index: 5, type: 'shortAnswer', paragraphRef: 1 }),
      q({ index: 6, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 7, type: 'inference' }),
      q({ index: 8, type: 'toneAttitude' }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const repetition = check.issues.find(i => i.code === 'SKILL_REPETITION');
    expect(repetition).toBeDefined();
    expect(repetition!.severity).toBe('warning');
  });
});

// ══════════════════════════════════════════
// F: Validator — Tone/Stance Quality
// ══════════════════════════════════════════

describe('Phase 4B-F: Validator — Tone/Stance Quality', () => {
  it('17. tone question with tone vocabulary does NOT trigger TONE_TOO_FACTUAL', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'toneAttitude', paragraphRef: 2,
        questionText: 'What is the writer\'s attitude toward the policy?',
        answer: 'Cautiously optimistic, as suggested by phrases like "promising but untested"',
      }),
      q({ index: 3, type: 'inference' }),
      q({ index: 4, type: 'referencing', paragraphRef: 2 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 6, type: 'summaryCloze', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    const toneFactual = check.issues.find(i => i.code === 'TONE_TOO_FACTUAL');
    expect(toneFactual).toBeUndefined();
  });

  it('18. tone question without tone vocabulary triggers TONE_TOO_FACTUAL', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'toneAttitude', paragraphRef: 2,
        questionText: 'What does the writer say about the policy?',
        answer: 'The policy is good',
      }),
      q({ index: 3, type: 'inference' }),
      q({ index: 4, type: 'referencing', paragraphRef: 2 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 6, type: 'summaryCloze', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    const toneFactual = check.issues.find(i => i.code === 'TONE_TOO_FACTUAL');
    expect(toneFactual).toBeDefined();
    expect(toneFactual!.severity).toBe('info');
  });
});

// ══════════════════════════════════════════
// G: Validator — Whole-Text Quality
// ══════════════════════════════════════════

describe('Phase 4B-G: Validator — Whole-Text Quality', () => {
  it('19. whole-text question referencing only one paragraph triggers WHOLE_TEXT_LOCAL', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq',
        // No paragraphRef → treated as whole-text, but question mentions single paragraph
        questionText: 'According to paragraph 2, what is the author\'s view?',
      }),
      q({ index: 3, type: 'inference', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 2 }),
      q({ index: 5, type: 'referencing', paragraphRef: 3 }),
      q({ index: 6, type: 'vocabularyInContext', paragraphRef: 1 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const wholeTextLocal = check.issues.find(i => i.code === 'WHOLE_TEXT_LOCAL');
    expect(wholeTextLocal).toBeDefined();
    expect(wholeTextLocal!.severity).toBe('warning');
  });

  it('20. true whole-text question (entire passage) does NOT trigger WHOLE_TEXT_LOCAL', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq',
        questionText: 'What conclusion can be drawn from the entire passage about the issue?',
      }),
      q({ index: 3, type: 'inference', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 2 }),
      q({ index: 5, type: 'referencing', paragraphRef: 3 }),
      q({ index: 6, type: 'vocabularyInContext', paragraphRef: 1 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const wholeTextLocal = check.issues.find(i => i.code === 'WHOLE_TEXT_LOCAL');
    expect(wholeTextLocal).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// H: Validator — Cross-Paragraph Quality
// ══════════════════════════════════════════

describe('Phase 4B-H: Validator — Cross-Paragraph Quality', () => {
  it('21. sequencing with single paragraphRef triggers CROSS_PARA_SINGLE', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'sequencing', paragraphRef: 2,
        questionText: 'Arrange the events in order.',
      }),
      q({ index: 3, type: 'inference' }),
      q({ index: 4, type: 'toneAttitude' }),
      q({ index: 5, type: 'referencing', paragraphRef: 3 }),
      q({ index: 6, type: 'vocabularyInContext', paragraphRef: 1 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const crossParaSingle = check.issues.find(i => i.code === 'CROSS_PARA_SINGLE');
    expect(crossParaSingle).toBeDefined();
    expect(crossParaSingle!.severity).toBe('info');
  });

  it('22. sequencing with multi-paragraph reference does NOT trigger CROSS_PARA_SINGLE', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'sequencing',
        questionText: 'Arrange the events from paragraphs 2-5 in order.',
      }),
      q({ index: 3, type: 'inference' }),
      q({ index: 4, type: 'toneAttitude' }),
      q({ index: 5, type: 'referencing', paragraphRef: 3 }),
      q({ index: 6, type: 'vocabularyInContext', paragraphRef: 1 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const crossParaSingle = check.issues.find(i => i.code === 'CROSS_PARA_SINGLE');
    expect(crossParaSingle).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// I: Regression — Blueprint Coverage Intact
// ══════════════════════════════════════════

describe('Phase 4B-I: Regression — Blueprint Coverage', () => {
  it('23. all families satisfied still passes', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 3, type: 'referencing', paragraphRef: 2 }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 5, type: 'inference' }),
      q({ index: 6, type: 'toneAttitude',
        questionText: 'What is the writer\'s attitude?',
        answer: 'Skeptical but hopeful',
      }),
      q({ index: 7, type: 'summaryCloze', paragraphRef: 3 }),
      q({ index: 8, type: 'mcq' }), // whole-text
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    expect(check.passed).toBe(true);
    expect(check.retryable).toBe(false);
  });

  it('24. missing whole-text in multi-paragraph still triggers critical', () => {
    const questions: DSEreadingQuestion[] = Array.from({ length: 7 }, (_, i) =>
      q({ index: i + 1, type: 'mcq', paragraphRef: (i % 4) + 1 }),
    );
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const wholeTextIssue = check.issues.find(i => i.code === 'MISSING_WHOLE_TEXT');
    expect(wholeTextIssue).toBeDefined();
    expect(wholeTextIssue!.severity).toBe('critical');
  });

  it('25. SKILL_DISTRIBUTION constants are valid', () => {
    expect(SKILL_DISTRIBUTION.maxFactualRatio).toBeLessThanOrEqual(0.6);
    expect(SKILL_DISTRIBUTION.maxFactualRatio).toBeGreaterThan(0);
    expect(SKILL_DISTRIBUTION.minHigherOrderRatio).toBeGreaterThan(0);
    expect(SKILL_DISTRIBUTION.minHigherOrderRatio).toBeLessThanOrEqual(0.3);
    expect(SKILL_DISTRIBUTION.maxSameSkillRatio).toBeLessThanOrEqual(0.5);
  });
});
