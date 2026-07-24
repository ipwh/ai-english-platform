// ============================================
// Sprint 106: Assessment Registry
// ============================================

import type { AssessmentRule, AssessmentCheck, AssessmentContext } from './assessment-types';
import { logger } from '@/shared/logger/logger';

class AssessmentRegistry {
  private rules = new Map<string, AssessmentRule>();

  register(rule: AssessmentRule): this {
    if (this.rules.has(rule.id)) {
      logger.warn({ module: 'assessment-registry', ruleId: rule.id }, 'Rule already registered — overwriting');
    }
    this.rules.set(rule.id, rule);
    return this;
  }

  unregister(id: string): boolean { return this.rules.delete(id); }
  get(id: string): AssessmentRule | undefined { return this.rules.get(id); }
  list(): AssessmentRule[] { return [...this.rules.values()]; }
  get count(): number { return this.rules.size; }
  clear(): void { this.rules.clear(); }

  assessAll(question: Record<string, unknown>, context?: AssessmentContext): AssessmentCheck[] {
    return this.list().map(rule => {
      try {
        return rule.assess(question, context);
      } catch (err) {
        return {
          ruleId: rule.id, passed: false, score: 0,
          message: `Rule error: ${err instanceof Error ? err.message : String(err)}`,
          priority: rule.priority, estimatedRepairCost: 0,
        };
      }
    });
  }
}

export const assessmentRegistry = new AssessmentRegistry();
