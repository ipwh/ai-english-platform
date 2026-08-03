// ============================================
// Phase 3A.2: Blueprint Validator Tests (12 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validateQuestionSetBlueprint,
  shouldRetryBlueprint,
  buildBlueprintRetryInstruction,
} from '@/modules/ai/prompts/reading/types';
import type { DSEreadingQuestion } from '@/modules/ai/prompts/reading/types';

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

describe('Phase 3A.2: Blueprint Validator', () => {
  // ═══ 1-4: Critical Fail Detection ═══

  it('1. missing whole-text item triggers critical fail (multi-paragraph)', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'mcq', paragraphRef: 2 }),
      q({ index: 3, type: 'shortAnswer', paragraphRef: 3 }),
      q({ index: 4, type: 'trueFalseNG', paragraphRef: 1 }),
      q({ index: 5, type: 'inference', paragraphRef: 2 }),
      q({ index: 6, type: 'toneAttitude', paragraphRef: 3 }),
      q({ index: 7, type: 'vocabularyInContext', paragraphRef: 2 }),
      // All have paragraphRef → no whole-text item found
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });

    const wholeTextIssue = check.issues.find(i => i.code === 'MISSING_WHOLE_TEXT');
    expect(wholeTextIssue).toBeDefined();
    expect(wholeTextIssue!.severity).toBe('critical');
    expect(check.passed).toBe(false);
    expect(check.retryable).toBe(true);
  });

  it('2. missing inference triggers critical fail', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'trueFalseNG', paragraphRef: 2 }),
      q({ index: 3, type: 'shortAnswer', paragraphRef: 3 }),
      q({ index: 4, type: 'toneAttitude' }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });

    const inferenceIssue = check.issues.find(i => i.code === 'MISSING_INFERENCE');
    expect(inferenceIssue).toBeDefined();
    expect(inferenceIssue!.severity).toBe('critical');
    expect(check.passed).toBe(false);
  });

  it('3. missing tone_attitude triggers critical fail', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'inference' }),
      q({ index: 3, type: 'shortAnswer', paragraphRef: 3 }),
      q({ index: 4, type: 'referencing', paragraphRef: 2 }),
    ];
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });

    const toneIssue = check.issues.find(i => i.code === 'MISSING_TONESTANCE');
    expect(toneIssue).toBeDefined();
    expect(toneIssue!.severity).toBe('critical');
  });

  it('4. short set does not critical-fail on whole-text (2 paragraphs)', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'trueFalseNG', paragraphRef: 2 }),
      q({ index: 3, type: 'inference' }),
      q({ index: 4, type: 'toneAttitude' }),
    ];
    const check = validateQuestionSetBlueprint(questions, 2, { mode: 'legacy' });

    // 2 paragraphs → whole-text not required
    const wholeTextIssue = check.issues.find(i => i.code === 'MISSING_WHOLE_TEXT');
    expect(wholeTextIssue).toBeUndefined();
  });

  // ═══ 5-7: Context-Aware Rules ═══

  it('5. short exercise does not hard-fail without summary item', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'inference' }),
      q({ index: 3, type: 'toneAttitude' }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 2 }),
      q({ index: 5, type: 'referencing', paragraphRef: 3 }),
    ];
    // Short set (≤6 questions), mode=exercise → summary skipped
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'exercise' });

    const summaryIssue = check.issues.find(i => i.code === 'MISSING_SUMMARY_TRANSFORM');
    // Should not be critical or even present for short exercise
    expect(summaryIssue || { severity: 'none' }).not.toHaveProperty('severity', 'critical');
  });

  it('6. full-paper hard-fails without summary item', () => {
    const questions: DSEreadingQuestion[] = Array.from({ length: 8 }, (_, i) =>
      q({ index: i + 1, type: i < 3 ? 'mcq' : i < 5 ? 'shortAnswer' : i === 5 ? 'inference' : i === 6 ? 'toneAttitude' : 'referencing', paragraphRef: (i % 4) + 1 }),
    );
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'full-paper' });

    const summaryIssue = check.issues.find(i => i.code === 'MISSING_SUMMARY_TRANSFORM');
    expect(summaryIssue).toBeDefined();
    expect(summaryIssue!.severity).toBe('critical');
  });

  it('7. paragraph coverage threshold: >30% uncovered triggers warning', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'inference' }),
      q({ index: 3, type: 'toneAttitude' }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 1 }),
    ];
    // 4 paragraphs, only para 1 covered → 75% uncovered
    const check = validateQuestionSetBlueprint(questions, 4, { mode: 'legacy' });

    const covIssue = check.issues.find(i => i.code === 'UNCOVERED_PARAGRAPHS');
    expect(covIssue).toBeDefined();
    expect(covIssue!.severity).toBe('warning');
  });

  // ═══ 8-10: Retry Behavior ═══

  it('8. shouldRetryBlueprint returns true on critical fail', () => {
    const check = {
      passed: false,
      retryable: true,
      issues: [{ code: 'MISSING_INFERENCE', severity: 'critical' as const, message: 'test' }],
      typeFamilyCoverage: {},
      issueMessages: ['test'],
    };
    expect(shouldRetryBlueprint(check)).toBe(true);
  });

  it('9. shouldRetryBlueprint returns false on warnings-only', () => {
    const check = {
      passed: true,
      retryable: false,
      issues: [{ code: 'UNCOVERED_PARAGRAPHS', severity: 'warning' as const, message: 'test' }],
      typeFamilyCoverage: {},
      issueMessages: ['test'],
    };
    expect(shouldRetryBlueprint(check)).toBe(false);
  });

  it('10. buildBlueprintRetryInstruction contains critical codes', () => {
    const check = {
      passed: false,
      retryable: true,
      issues: [
        { code: 'MISSING_INFERENCE', severity: 'critical' as const, message: 'No inference items' },
        { code: 'MISSING_TONESTANCE', severity: 'critical' as const, message: 'No tone items' },
      ],
      typeFamilyCoverage: {},
      issueMessages: [],
    };
    const instruction = buildBlueprintRetryInstruction(check);
    expect(instruction).toContain('MISSING_INFERENCE');
    expect(instruction).toContain('MISSING_TONESTANCE');
  });

  // ═══ 11-12: Edge Cases ═══

  it('11. all families satisfied passes with no issues', () => {
    const questions: DSEreadingQuestion[] = [
      q({ index: 1, type: 'mcq', paragraphRef: 1 }),
      q({ index: 2, type: 'shortAnswer', paragraphRef: 2 }),
      q({ index: 3, type: 'referencing', paragraphRef: 2 }),
      q({ index: 4, type: 'vocabularyInContext', paragraphRef: 3 }),
      q({ index: 5, type: 'inference' }),
      q({ index: 6, type: 'toneAttitude' }),
      q({ index: 7, type: 'summaryCloze', paragraphRef: 3 }),
      q({ index: 8, type: 'mcq' }), // No paragraphRef → whole-text item
    ];
    const check = validateQuestionSetBlueprint(questions, 3, { mode: 'legacy' });

    expect(check.passed).toBe(true);
    expect(check.retryable).toBe(false);
    expect(check.issues.filter(i => i.severity === 'critical')).toHaveLength(0);
  });

  it('12. empty questions array does not crash', () => {
    const check = validateQuestionSetBlueprint([], 3, { mode: 'legacy' });
    expect(check).toBeDefined();
    expect(check.issues.length).toBeGreaterThan(0);
    // All families missing should be critical
    const criticals = check.issues.filter(i => i.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(2); // inference + tone at minimum
  });
});
