// ============================================
// Sprint 108: Optimization Registry
// ============================================

import type { OptimizationRule, OptimizationCheck } from './optimization-types';
import { logger } from '@/shared/logger/logger';

class OptimizationRegistry {
  private rules = new Map<string, OptimizationRule>();

  register(rule: OptimizationRule): this {
    if (this.rules.has(rule.id)) logger.warn({ module: 'opt-registry', ruleId: rule.id }, 'Overwriting rule');
    this.rules.set(rule.id, rule);
    return this;
  }

  unregister(id: string): boolean { return this.rules.delete(id); }
  get(id: string): OptimizationRule | undefined { return this.rules.get(id); }
  list(): OptimizationRule[] { return [...this.rules.values()]; }
  get count(): number { return this.rules.size; }
  clear(): void { this.rules.clear(); }

  optimizeAll(question: Record<string, unknown>, assessmentScore?: number): { question: Record<string, unknown>; checks: OptimizationCheck[] } {
    let current = question;
    const checks: OptimizationCheck[] = [];
    for (const rule of this.list()) {
      try {
        const result = rule.optimize(current, assessmentScore);
        current = result.question;
        checks.push(result.check);
      } catch (err) {
        checks.push({ ruleId: rule.id, passed: false, action: 'flag', score: 0, priority: rule.priority, message: `Error: ${String(err)}`, changes: [] });
      }
    }
    return { question: current, checks };
  }
}

export const optimizationRegistry = new OptimizationRegistry();
