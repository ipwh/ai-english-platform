// ============================================
// Sprint 101: Quality Rule Registry
// Plug-and-play rule registration. Open/Closed Principle.
// ============================================

import type { QualityRule, RuleCheckResult, RepairResult, QualityContext } from './quality-types';
import { logger } from '@/shared/logger/logger';

class QualityRegistry {
  private rules: Map<string, QualityRule> = new Map();
  private order: string[] = []; // registration order for priority sorting

  /** Register a quality rule. Returns this for chaining. */
  registerRule<T>(rule: QualityRule<T>): this {
    if (this.rules.has(rule.id)) {
      logger.warn({ module: 'quality-registry', ruleId: rule.id }, 'Rule already registered, overwriting');
    }
    this.rules.set(rule.id, rule as QualityRule);
    if (!this.order.includes(rule.id)) {
      this.order.push(rule.id);
    }
    logger.info({ module: 'quality-registry', ruleId: rule.id, priority: rule.priority }, 'Quality rule registered');
    return this;
  }

  /** Remove a rule by ID. */
  unregisterRule(ruleId: string): boolean {
    const existed = this.rules.has(ruleId);
    if (existed) {
      this.rules.delete(ruleId);
      this.order = this.order.filter(id => id !== ruleId);
      logger.info({ module: 'quality-registry', ruleId }, 'Quality rule unregistered');
    }
    return existed;
  }

  /** Get a single rule by ID. */
  getRule(ruleId: string): QualityRule | undefined {
    return this.rules.get(ruleId);
  }

  /** List all registered rules, sorted by priority (critical→high→medium→low) then by registration order. */
  listRules(): QualityRule[] {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return this.order
      .map(id => this.rules.get(id)!)
      .filter(Boolean)
      .sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 99;
        const pb = priorityOrder[b.priority] ?? 99;
        return pa - pb;
      });
  }

  /** Execute all matching rules against input. Returns results in priority order. */
  executeAll<T>(
    input: T,
    context: QualityContext,
  ): { results: Map<string, RuleCheckResult>; repaired: T; repairs: Array<{ ruleId: string; result: RepairResult }> } {
    const results = new Map<string, RuleCheckResult>();
    const repairs: Array<{ ruleId: string; result: RepairResult }> = [];
    let current = input;

    const matchingRules = this.listRules().filter(
      r => r.supportedTypes.length === 0 || r.supportedTypes.includes(context.outputType),
    );

    for (const rule of matchingRules) {
      try {
        const result = rule.validate(current, context);
        results.set(rule.id, result);

        // Attempt repair if rule has repair function and validation failed
        if (!result.passed && rule.repair) {
          for (const failure of result.failures) {
            const repairResult = rule.repair(current as unknown as Parameters<typeof rule.repair>[0], failure, context);
            if (repairResult.repaired) {
              current = repairResult.output as unknown as T;
              repairs.push({ ruleId: rule.id, result: repairResult });
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ module: 'quality-registry', ruleId: rule.id, error: msg }, 'Quality rule execution failed');
        results.set(rule.id, {
          passed: false,
          failures: [{ ruleId: rule.id, message: `Rule execution error: ${msg}` }],
          warnings: [],
        });
      }
    }

    return { results, repaired: current, repairs };
  }

  /** Get the number of registered rules. */
  get ruleCount(): number {
    return this.rules.size;
  }

  /** Remove all registered rules. */
  clear(): void {
    this.rules.clear();
    this.order = [];
  }
}

/** Singleton instance */
export const qualityRegistry = new QualityRegistry();
