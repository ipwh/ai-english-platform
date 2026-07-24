// ============================================
// Sprint 102: AnswerFieldRule
// Validates that the answer field exists and is non-empty.
// Repairs by inserting a placeholder.
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

interface HasAnswer {
  answer?: string | unknown;
  type?: string;
}

export class AnswerFieldRule extends BaseQualityRule<HasAnswer> {
  readonly id = 'question:answer-field';
  readonly name = 'Answer Field Check';
  readonly description = 'Ensures every question has a non-empty answer field';
  readonly priority = 'critical' as const;
  readonly supportedTypes = ['GeneratedQuestion', 'GeneratedQuestion[]'];

  validate(input: HasAnswer): RuleCheckResult {
    const answer = input.answer;
    if (answer === undefined || answer === null) {
      return this.fail('Answer field is missing (undefined/null)');
    }
    if (typeof answer !== 'string') {
      return this.fail('Answer field is not a string');
    }
    if (answer.trim().length === 0) {
      return this.fail('Answer field is empty');
    }
    if (answer.trim() === '.' || answer.trim() === '...') {
      return this.fail('Answer field contains only punctuation — likely placeholder');
    }
    return this.pass();
  }

  repair(input: HasAnswer): { repaired: boolean; output: HasAnswer; changes: string[] } {
    if (!input.answer || (typeof input.answer === 'string' && input.answer.trim().length === 0)) {
      return {
        repaired: true,
        output: { ...input, answer: '[Answer missing — please regenerate]' },
        changes: ['Inserted placeholder for missing answer'],
      };
    }
    return { repaired: false, output: input, changes: [] };
  }
}
