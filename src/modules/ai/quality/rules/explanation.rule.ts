// ============================================
// Sprint 102: ExplanationRule
// Validates that explanation fields exist and meet minimum length.
// Repairs by inserting placeholder or copying across languages.
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

interface HasExplanation {
  explanationZh?: string;
  explanationEn?: string;
  commonMistake?: string;
}

const MIN_EXPLANATION_LENGTH = 10; // characters
const PLACEHOLDER_ZH = '[Explanation not provided — please regenerate]';
const PLACEHOLDER_EN = '[Explanation not provided — please regenerate]';

export class ExplanationRule extends BaseQualityRule<HasExplanation> {
  readonly id = 'question:explanation';
  readonly name = 'Explanation Quality Check';
  readonly description = 'Ensures explanations exist and meet minimum length';
  readonly priority = 'medium' as const;
  readonly supportedTypes = ['GeneratedQuestion', 'GeneratedQuestion[]'];

  validate(input: HasExplanation): RuleCheckResult {
    const warnings: string[] = [];
    const failures: Array<{ ruleId: string; message: string }> = [];

    // Check Chinese explanation
    if (!input.explanationZh || input.explanationZh.trim().length === 0) {
      failures.push({ ruleId: this.id, message: 'explanationZh is missing or empty' });
    } else if (input.explanationZh.trim().length < MIN_EXPLANATION_LENGTH) {
      warnings.push(`explanationZh is only ${input.explanationZh.trim().length} chars (min ${MIN_EXPLANATION_LENGTH})`);
    }

    // Check English explanation
    if (!input.explanationEn || input.explanationEn.trim().length === 0) {
      failures.push({ ruleId: this.id, message: 'explanationEn is missing or empty' });
    } else if (input.explanationEn.trim().length < MIN_EXPLANATION_LENGTH) {
      warnings.push(`explanationEn is only ${input.explanationEn.trim().length} chars (min ${MIN_EXPLANATION_LENGTH})`);
    }

    // Check commonMistake (optional but nice to have)
    if (!input.commonMistake || input.commonMistake.trim().length === 0) {
      warnings.push('commonMistake is missing — consider adding');
    }

    if (failures.length > 0) {
      return { passed: false, failures, warnings };
    }
    if (warnings.length > 0) {
      return { passed: true, failures: [], warnings };
    }
    return this.pass();
  }

  repair(input: HasExplanation): { repaired: boolean; output: HasExplanation; changes: string[] } {
    const repaired = { ...input };
    const changes: string[] = [];
    let changed = false;

    // Copy from other language if available
    if (!repaired.explanationZh || repaired.explanationZh.trim().length === 0) {
      if (repaired.explanationEn && repaired.explanationEn.trim().length > 0) {
        repaired.explanationZh = repaired.explanationEn;
        changes.push('Copied explanationEn → explanationZh');
        changed = true;
      } else {
        repaired.explanationZh = PLACEHOLDER_ZH;
        changes.push('Inserted placeholder for missing explanationZh');
        changed = true;
      }
    }

    if (!repaired.explanationEn || repaired.explanationEn.trim().length === 0) {
      if (repaired.explanationZh && repaired.explanationZh.trim().length > 0) {
        repaired.explanationEn = repaired.explanationZh;
        changes.push('Copied explanationZh → explanationEn');
        changed = true;
      } else {
        repaired.explanationEn = PLACEHOLDER_EN;
        changes.push('Inserted placeholder for missing explanationEn');
        changed = true;
      }
    }

    return { repaired: changed, output: repaired, changes };
  }
}
