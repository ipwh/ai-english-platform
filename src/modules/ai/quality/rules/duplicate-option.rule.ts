// ============================================
// Sprint 102: DuplicateOptionRule
// Detects duplicate option text (case-insensitive).
// Cannot safely repair — returns Warning only.
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

interface HasOptions {
  choices?: string[];
}

export class DuplicateOptionRule extends BaseQualityRule<HasOptions> {
  readonly id = 'question:duplicate-options';
  readonly name = 'Duplicate Option Detection';
  readonly description = 'Detects duplicate option text, case-insensitive. Cannot safely repair.';
  readonly priority = 'medium' as const;
  readonly supportedTypes = ['GeneratedQuestion'];

  validate(input: HasOptions): RuleCheckResult {
    const choices = input.choices;
    if (!Array.isArray(choices) || choices.length < 2) {
      return this.pass(); // nothing to deduplicate
    }

    const seen = new Map<string, number>();
    const duplicates: string[] = [];

    for (let i = 0; i < choices.length; i++) {
      const key = (choices[i] || '').trim().toLowerCase();
      if (!key) continue;
      const prev = seen.get(key);
      if (prev !== undefined) {
        duplicates.push(
          `Option ${String.fromCharCode(65 + i)} "${choices[i]}" duplicates option ${String.fromCharCode(65 + prev)}`,
        );
      } else {
        seen.set(key, i);
      }
    }

    if (duplicates.length > 0) {
      return {
        passed: false,
        failures: [],
        warnings: duplicates,
      };
    }

    return this.pass();
  }
}
