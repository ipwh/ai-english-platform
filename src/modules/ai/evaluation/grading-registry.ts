// ============================================
// Sprint 105: Grading Registry
// Pluggable registry for evaluation rules.
// ============================================

import type { EvaluationRule, GradingPolicyConfig } from './evaluation-types';

class GradingRegistry {
  private rules: Map<string, EvaluationRule> = new Map();

  register(rule: EvaluationRule): this {
    this.rules.set(rule.name, rule);
    return this;
  }

  unregister(name: string): boolean {
    return this.rules.delete(name);
  }

  list(): EvaluationRule[] {
    return [...this.rules.values()];
  }

  get(name: string): EvaluationRule | undefined {
    return this.rules.get(name);
  }

  /** Evaluate student answer against reference using all registered rules. */
  evaluateAll(
    studentAnswer: string,
    referenceAnswer: string,
    config: GradingPolicyConfig,
  ): Array<{ rule: string; result: ReturnType<EvaluationRule['evaluate']> }> {
    return this.list().map(rule => ({
      rule: rule.name,
      result: rule.evaluate(studentAnswer, referenceAnswer, config),
    }));
  }

  get count(): number { return this.rules.size; }

  clear(): void { this.rules.clear(); }
}

export const gradingRegistry = new GradingRegistry();
