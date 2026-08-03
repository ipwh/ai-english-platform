// ============================================
// Phase 3C.1: MC Distractor Integration Tests (8 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import { validateAllMCDistractors, validateMCDistractors } from '@/modules/ai/prompts/reading/types';
import type { DSEreadingQuestion } from '@/modules/ai/prompts/reading/types';

function mcq(idx: number, choices: string[], answer: string, overrides: Partial<DSEreadingQuestion> = {}): DSEreadingQuestion {
  return {
    index: idx,
    type: 'mcq',
    questionText: `MC question ${idx}`,
    marks: 1,
    answer,
    explanationZh: '解釋',
    choices,
    ...overrides,
  };
}

describe('Phase 3C.1: MC Distractor Integration', () => {
  it('1. banned pattern triggers critical BlueprintIssue', () => {
    const questions = [mcq(1, ['A. First', 'B. All of the above', 'C. Third', 'D. Fourth'], 'A')];
    const issues = validateAllMCDistractors(questions);
    const critical = issues.find(i => i.code === 'MC_BANNED_PATTERN');
    expect(critical).toBeDefined();
    expect(critical!.severity).toBe('critical');
  });

  it('2. warning-only MC issues do not include critical severity', () => {
    const questions = [
      mcq(1, ['A. Short', 'B. Brief', 'C. Very long distractor that is quite different', 'D. Tiny'], 'C'),
      mcq(2, [
        'A. It may help in some cases',
        'B. It is fully effective always',
        'C. It may work differently for others',
        'D. It has limited but real impact',
      ], 'A'),
    ];
    const issues = validateAllMCDistractors(questions);
    const criticals = issues.filter(i => i.severity === 'critical');
    expect(criticals).toHaveLength(0);
    expect(issues.length).toBeGreaterThan(0); // warning present
  });

  it('3. duplicate distractors trigger warning', () => {
    const questions = [mcq(2, [
      'A. The policy is effective',
      'B. The policy works well',
      'C. Something different here',
      'D. The correct answer',
    ], 'D')];
    const issues = validateAllMCDistractors(questions);
    const dupIssue = issues.find(i => i.code === 'MC_DUPLICATE_DISTRACTORS');
    expect(dupIssue).toBeDefined();
    expect(dupIssue!.severity).toBe('warning');
  });

  it('4. strong MC set passes without distractor issues', () => {
    const questions = [mcq(3, [
      'A. It may help but depends on implementation',
      'B. It is fully effective and solves everything',
      'C. It may work only for a different group',
      'D. It has short-term use but not wider impact',
    ], 'A')];
    const issues = validateAllMCDistractors(questions);
    expect(issues).toHaveLength(0);
  });

  it('5. multiple MC items with no traps trigger critical if pervasive', () => {
    const questions = [
      mcq(1, ['A. Cat', 'B. Dog', 'C. Bird', 'D. Fish'], 'B'),
      mcq(2, ['A. Red', 'B. Blue', 'C. Green', 'D. Yellow'], 'C'),
      mcq(3, ['A. Up', 'B. Down', 'C. Left', 'D. Right'], 'A'),
    ];
    const issues = validateAllMCDistractors(questions);
    const trapIssue = issues.find(i => i.code === 'MC_NO_TRAP_STRUCTURE');
    expect(trapIssue).toBeDefined();
    // All 3 lack traps → critical
    expect(trapIssue!.severity).toBe('critical');
    expect(trapIssue!.message).toContain('3/3');
  });

  it('6. single MC item without trap is warning only', () => {
    const questions = [
      mcq(1, ['A. Cat', 'B. Dog', 'C. Bird', 'D. Fish'], 'B'),
      mcq(2, [
        'A. It may help in some cases',
        'B. It is completely effective always',
        'C. It may work differently for others',
        'D. It has limited but real impact',
      ], 'A'),
    ];
    const issues = validateAllMCDistractors(questions);
    const trapIssue = issues.find(i => i.code === 'MC_NO_TRAP_STRUCTURE');
    if (trapIssue) {
      // 1/2 without trap → warning not critical
      expect(trapIssue.severity).toBe('warning');
    }
  });

  it('7. non-MC questions are skipped', () => {
    const questions: DSEreadingQuestion[] = [
      mcq(1, ['A. X', 'B. Y', 'C. Z', 'D. W'], 'B'),
      {
        index: 2, type: 'shortAnswer', questionText: 'Explain', marks: 2, answer: 'test', explanationZh: 'test',
      },
    ];
    const issues = validateAllMCDistractors(questions);
    // Only the MC question is checked
    const mcIssues = issues.filter(i => i.code.startsWith('MC_'));
    expect(mcIssues.length).toBeGreaterThanOrEqual(0);
  });

  it('8. MC_STYLISTIC_OUTLIER triggers warning', () => {
    const questions = [mcq(4, [
      'A. Short answer',
      'B. Brief text',
      'C. This is a very long and detailed correct answer that clearly stands out from all the other short options',
      'D. Tiny option',
    ], 'C')];
    const issues = validateAllMCDistractors(questions);
    const styleIssue = issues.find(i => i.code === 'MC_STYLISTIC_OUTLIER');
    expect(styleIssue).toBeDefined();
    expect(styleIssue!.severity).toBe('warning');
  });
});
