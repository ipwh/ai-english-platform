// ============================================
// Sprint 102: MCQOptionRule
// Validates MC questions have exactly 4 valid options.
// Removes empty options, pads missing with placeholder.
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

interface HasMCQOptions {
  type?: string;
  choices?: string[];
}

const MCQ_TYPES = new Set(['mc', 'mcq', 'mcCloze']);

export class MCQOptionRule extends BaseQualityRule<HasMCQOptions> {
  readonly id = 'mcq:options';
  readonly name = 'MCQ Option Count Check';
  readonly description = 'Ensures MC questions have exactly 4 valid, non-empty options';
  readonly priority = 'high' as const;
  readonly supportedTypes = ['GeneratedQuestion'];

  validate(input: HasMCQOptions): RuleCheckResult {
    // Only applies to MC questions
    if (!input.type || !MCQ_TYPES.has(input.type.trim().toLowerCase())) {
      return this.pass(); // not applicable
    }

    const choices = input.choices || [];
    const valid = choices.filter(c => typeof c === 'string' && c.trim().length > 0);

    if (valid.length === 0) {
      return this.fail('MC question has no valid options');
    }
    if (valid.length < 4) {
      return this.fail(`MC question has only ${valid.length} valid options (expected 4)`);
    }
    if (valid.length > 4) {
      return this.warn(`MC question has ${valid.length} options (expected 4)`);
    }

    // Check for options that are identical after trimming
    const trimmed = valid.map(c => c.trim().toLowerCase());
    const unique = new Set(trimmed);
    if (unique.size < trimmed.length) {
      return this.warn(`MC question has ${trimmed.length - unique.size} duplicate option(s) after normalization`);
    }

    return this.pass();
  }

  repair(input: HasMCQOptions): { repaired: boolean; output: HasMCQOptions; changes: string[] } {
    if (!input.type || !MCQ_TYPES.has(input.type.trim().toLowerCase())) {
      return { repaired: false, output: input, changes: [] };
    }

    const choices = (input.choices || []).filter(c => typeof c === 'string' && c.trim().length > 0);
    const changes: string[] = [];
    let changed = false;

    // Remove empty options
    if (choices.length < (input.choices || []).length) {
      changes.push(`Removed ${(input.choices || []).length - choices.length} empty options`);
      changed = true;
    }

    // Pad to exactly 4 with placeholders
    while (choices.length < 4) {
      choices.push(`Option ${String.fromCharCode(65 + choices.length)}`);
      changed = true;
    }
    if (choices.length < 4) {
      changes.push(`Padded to 4 options (was ${(input.choices || []).length})`);
    }

    // Truncate to 4
    if (choices.length > 4) {
      choices.length = 4;
      changes.push('Truncated to 4 options');
      changed = true;
    }

    return {
      repaired: changed,
      output: { ...input, choices },
      changes,
    };
  }
}
