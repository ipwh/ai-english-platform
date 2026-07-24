// ============================================
// Sprint 101: Quality Rule Base
// Abstract base class for all quality rules.
// Provides sensible defaults so rule authors focus on logic.
// ============================================

import type { QualityRule, RuleCheckResult, RulePriority, RuleCategory, QualityDimensions } from './quality-types';

/**
 * Base class for quality rules. Extend this to create new rules.
 *
 * Example:
 *   class MyRule extends BaseQualityRule<GeneratedQuestion> {
 *     id = 'question:my-check';
 *     name = 'My Check';
 *     description = 'Checks something important';
 *     priority = 'high';
 *     supportedTypes = ['GeneratedQuestion'];
 *
 *     validate(input: GeneratedQuestion): RuleCheckResult {
 *       // ... validation logic ...
 *     }
 *   }
 */
export abstract class BaseQualityRule<TInput = unknown> implements QualityRule<TInput> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  readonly priority: RulePriority = 'medium';
  readonly supportedTypes: string[] = [];
  /** Sprint 103: validation category */
  readonly category: RuleCategory = 'deterministic';
  /** Sprint 103: which quality dimension this rule contributes to */
  readonly dimension: keyof QualityDimensions = 'structure';

  /** Override to implement validation logic. */
  abstract validate(input: TInput): RuleCheckResult;

  /** Helper: create a passing result. */
  protected pass(): RuleCheckResult {
    return { passed: true, failures: [], warnings: [] };
  }

  /** Helper: create a failing result with a single failure. */
  protected fail(message: string, detail?: string): RuleCheckResult {
    return {
      passed: false,
      failures: [{ ruleId: this.id, message, detail }],
      warnings: [],
    };
  }

  /** Helper: create a passing result with warnings. */
  protected warn(...warnings: string[]): RuleCheckResult {
    return { passed: true, failures: [], warnings };
  }
}
