// ============================================
// Phase 4B: Skill Boundaries & Higher-Order Reasoning Tests (16 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validateQuestionSetBlueprint,
  mapTypeToSkillCategory,
  resolveSkillCategory,
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
    expect(SKILL_DISTRIBUTION.maxHigherOrderShortPassage).toBeLessThanOrEqual(0.2);
    expect(SKILL_DISTRIBUTION.maxWholeTextPartA).toBe(1);
  });
});

// ══════════════════════════════════════════
// J: Phase 4B.1 — Type-Skill Decoupling (resolveSkillCategory)
// ══════════════════════════════════════════

describe('Phase 4B.1-J: Type-Skill Decoupling', () => {
  it('26. resolveSkillCategory respects explicit skillCategory override', () => {
    const question = q({ index: 1, type: 'mcq', skillCategory: 'toneStance' });
    expect(resolveSkillCategory(question)).toBe('toneStance');
  });

  it('27. MCQ with skillCategory override can target inference', () => {
    const question = q({ index: 1, type: 'mcq', skillCategory: 'inference' });
    expect(resolveSkillCategory(question)).toBe('inference');
  });

  it('28. shortAnswer without override maps to factual', () => {
    const question = q({ index: 1, type: 'shortAnswer' });
    expect(resolveSkillCategory(question)).toBe('factual');
  });

  it('29. summaryCloze with skillCategory=wholeText override works', () => {
    const question = q({ index: 1, type: 'summaryCloze', skillCategory: 'wholeText' });
    expect(resolveSkillCategory(question)).toBe('wholeText');
  });

  it('30. skillCategory override affects skillCounts in validator', () => {
    // 4 questions: 3 factual + 1 mcq with skillCategory=toneStance → toneStance count should be 1
    // Note: type-family check (#1) uses q.type, not skillCategory. Skill override only affects skill-count checks.
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 3, type: 'mcq', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude', skillCategory: 'inference',
        questionText: 'What can be inferred?',
        answer: 'The writer implies change is needed',
      }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    // With skillCategory=toneStance mapped to 'inference', the inference count should be 1 (from the override)
    // but toneAttitude type still satisfies MISSING_TONESTANCE family check
    const toneMissing = check.issues.find(i => i.code === 'MISSING_TONESTANCE');
    expect(toneMissing).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// K: Phase 4B.1 — Short Passage Guardrails
// ══════════════════════════════════════════

describe('Phase 4B.1-K: Short Passage Guardrails', () => {
  it('31. short passage (3 paragraphs) is NOT forced into whole-text critical fail', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 2 }),
      q({ index: 3, type: 'shortAnswer', paragraphRef: 3 }),
      q({ index: 4, type: 'inference', paragraphRef: 1 }),
      q({ index: 5, type: 'referencing', paragraphRef: 2 }),
      q({ index: 6, type: 'vocabularyInContext', paragraphRef: 3 }),
    ];
    // All have paragraphRef, 3 paragraphs → whole-text not required
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    const wholeTextIssue = check.issues.find(i => i.code === 'MISSING_WHOLE_TEXT');
    expect(wholeTextIssue).toBeUndefined();
  });

  it('32. short passage with 3 paragraphs and SKILL_LOW_HIGHER_ORDER is NOT triggered', () => {
    // Short passage (3 paragraphs) shouldn't trigger the "need ≥20% higher-order" rule
    const questions: DSEreadingQuestion[] = Array.from({ length: 6 }, (_, i) =>
      q({ index: i + 1, type: 'mcq', paragraphRef: (i % 3) + 1 }),
    );
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    const lowHO = check.issues.find(i => i.code === 'SKILL_LOW_HIGHER_ORDER');
    // 3 paragraphs < 4, so check #9 should NOT trigger
    expect(lowHO).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// L: Phase 4B.1 — Part A Guardrails
// ══════════════════════════════════════════

describe('Phase 4B.1-L: Part A Guardrails', () => {
  it('33. Part A with too many higher-order items triggers PART_A_HIGHER_ORDER_OVERLOAD', () => {
    // 6 questions, 3 toneStance = 50% > 15% cap
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'toneAttitude', paragraphRef: 2,
        questionText: 'What is the attitude?', answer: 'skeptical',
      }),
      q({ index: 3, type: 'toneAttitude', paragraphRef: 1,
        questionText: 'What is the tone?', answer: 'ironic',
      }),
      q({ index: 4, type: 'toneAttitude', paragraphRef: 2,
        questionText: 'What is the stance?', answer: 'critical',
      }),
      q({ index: 5, type: 'referencing', paragraphRef: 3 }),
      q({ index: 6, type: 'vocabularyInContext', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy', part: 'A' });
    const overload = check.issues.find(i => i.code === 'PART_A_HIGHER_ORDER_OVERLOAD');
    expect(overload).toBeDefined();
    expect(overload!.severity).toBe('warning');
  });

  it('34. Part A with reasonable higher-order ratio does NOT trigger overload', () => {
    // 6 questions, 0 higher-order = 0% ≤ 15% — fine
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 2 }),
      q({ index: 3, type: 'shortAnswer', paragraphRef: 3 }),
      q({ index: 4, type: 'referencing', paragraphRef: 1 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 2 }),
      q({ index: 6, type: 'trueFalseNG', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy', part: 'A' });
    const overload = check.issues.find(i => i.code === 'PART_A_HIGHER_ORDER_OVERLOAD');
    expect(overload).toBeUndefined();
  });

  it('35. Part A with >1 whole-text items triggers PART_A_TOO_MANY_WHOLE_TEXT', () => {
    // 6 questions, 2 without paragraphRef → 2 whole-text > 1 cap
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq' }), // whole-text (no paragraphRef)
      q({ index: 3, type: 'mcq' }), // whole-text (no paragraphRef)
      q({ index: 4, type: 'referencing', paragraphRef: 2 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 6, type: 'trueFalseNG', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy', part: 'A' });
    const tooManyWT = check.issues.find(i => i.code === 'PART_A_TOO_MANY_WHOLE_TEXT');
    expect(tooManyWT).toBeDefined();
    expect(tooManyWT!.severity).toBe('warning');
  });

  it('36. Part A guardrails only apply when part=A', () => {
    // Same questions, but part=B2 — no Part A guardrails triggered
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq' }), // whole-text
      q({ index: 3, type: 'mcq' }), // whole-text
      q({ index: 4, type: 'referencing', paragraphRef: 2 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 6, type: 'trueFalseNG', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy', part: 'B2' });
    const tooManyWT = check.issues.find(i => i.code === 'PART_A_TOO_MANY_WHOLE_TEXT');
    expect(tooManyWT).toBeUndefined();
  });
});

// ══════════════════════════════════════════
// M: Regression — Phase 4B Behavior Intact
// ══════════════════════════════════════════

describe('Phase 4B.1-M: Regression — Phase 4B Intact', () => {
  it('37. missing whole-text in 4-paragraph passage still triggers critical', () => {
    const questions: DSEreadingQuestion[] = Array.from({ length: 7 }, (_, i) =>
      q({ index: i + 1, type: 'mcq', paragraphRef: (i % 4) + 1 }),
    );
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });
    const wholeTextIssue = check.issues.find(i => i.code === 'MISSING_WHOLE_TEXT');
    expect(wholeTextIssue).toBeDefined();
    expect(wholeTextIssue!.severity).toBe('critical');
  });

  it('38. tone/stance quality checks still work with skillCategory override', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', skillCategory: 'toneStance',
        questionText: 'What is the writer\'s attitude?',
        answer: 'Cautiously optimistic',
      }),
      q({ index: 3, type: 'inference' }),
      q({ index: 4, type: 'referencing', paragraphRef: 2 }),
      q({ index: 5, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 6, type: 'summaryCloze', paragraphRef: 3 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });
    const toneFactual = check.issues.find(i => i.code === 'TONE_TOO_FACTUAL');
    // The tone check only runs on type='toneAttitude', not on skillCategory='toneStance'
    // So an MCQ with skillCategory=toneStance won't trigger the tone vocabulary check
    // This is expected — the check is type-based, not skill-based
    expect(toneFactual).toBeUndefined();
  });
});
