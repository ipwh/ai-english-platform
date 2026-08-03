// ============================================
// Phase 3C: MC Distractor Quality Tests (10 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import { validateMCDistractors } from '@/modules/ai/prompts/reading/types';

describe('Phase 3C: MC Distractor Validator', () => {
  it('1. bans "All of the above" pattern', () => {
    const check = validateMCDistractors(
      ['A. First option', 'B. Second option', 'C. All of the above', 'D. Fourth option'],
      'B',
    );
    expect(check.bannedPatternFound).toBe(true);
    expect(check.passed).toBe(false);
  });

  it('2. bans "None of the above" pattern', () => {
    const check = validateMCDistractors(
      ['A. First', 'B. None of the above', 'C. Third', 'D. Fourth'],
      'A',
    );
    expect(check.bannedPatternFound).toBe(true);
  });

  it('3. detects duplicate-like distractors', () => {
    const check = validateMCDistractors(
      [
        'A. The policy is effective',
        'B. The policy works well', // near-duplicate of A
        'C. Something completely different here',
        'D. The policy is ineffective',
      ],
      'D',
    );
    expect(check.duplicateDistractors).toBe(true);
  });

  it('4. detects stylistic outlier correct option', () => {
    const check = validateMCDistractors(
      [
        'A. Short',
        'B. Brief',
        'C. This is a very very long correct answer that stands out from all the other options',
        'D. Tiny',
      ],
      'C',
    );
    expect(check.stylisticOutlier).toBe(true);
  });

  it('5. flags weak distractors with no plausible trap', () => {
    const check = validateMCDistractors(
      ['A. Apples', 'B. Bananas', 'C. Oranges', 'D. Grapes'],
      'B',
    );
    expect(check.hasPlausibleTrap).toBe(false);
    expect(check.issues.some(i => i.includes('plausible trap'))).toBe(true);
  });

  it('6. accepts plausible half-true distractors', () => {
    const check = validateMCDistractors(
      [
        'A. It may help in some situations but depends on implementation',
        'B. It is fully effective because it solves the problem at its root',
        'C. It may work well but only if applied to a different group',
        'D. It is useful only for short-term results',
      ],
      'A',
    );
    // B shares words with A but differs → plausible trap
    expect(check.hasPlausibleTrap).toBe(true);
    expect(check.bannedPatternFound).toBe(false);
  });

  it('7. accepts contrast-based distractors', () => {
    const check = validateMCDistractors(
      [
        'A. The policy increases efficiency',
        'B. The policy however reduces output unexpectedly',
        'C. The policy unlike others is different',
        'D. The policy does not affect anything',
      ],
      'A',
    );
    expect(check.hasPlausibleTrap).toBe(true);
    expect(check.passed).toBe(true);
  });

  it('8. does not flag normal balanced options', () => {
    const check = validateMCDistractors(
      [
        'A. The proposal is fully supported by all parties',
        'B. Critics argue the plan has serious flaws',
        'C. Most observers remain undecided on this issue',
        'D. The writer accepts some parts but questions others',
      ],
      'D',
    );
    expect(check.stylisticOutlier).toBe(false);
    expect(check.bannedPatternFound).toBe(false);
    expect(check.duplicateDistractors).toBe(false);
  });

  it('9. detects length outlier when correct is much shorter', () => {
    const check = validateMCDistractors(
      [
        'A. A very long detailed explanation of the policy',
        'B. Another very long detailed explanation',
        'C. Yet another very long detailed explanation',
        'D. Short',
      ],
      'D',
    );
    expect(check.stylisticOutlier).toBe(true);
  });

  it('10. passes strong distractor set', () => {
    const check = validateMCDistractors(
      [
        'A. It may help in some situations, but success depends on careful implementation',
        'B. It is fully effective because it solves the problem at its root',
        'C. It may work well, but only if the policy is applied to a different group',
        'D. It is useful only for short-term results and does not affect the wider issue',
      ],
      'A',
    );
    expect(check.hasPlausibleTrap).toBe(true);
    expect(check.bannedPatternFound).toBe(false);
    expect(check.passed).toBe(true);
  });
});
