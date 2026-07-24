// ============================================
// Sprint 112: Fairness Registry
// Open/Closed: new fairness rules auto-register.
// ============================================

import type { FairnessRule } from './fairness-types';
import { allFairnessRules } from './rules/fairness-rules';

const rules = new Map<string, FairnessRule>();

export function registerRule(rule: FairnessRule): void {
  rules.set(rule.id, rule);
}

export function getRule(id: string): FairnessRule | undefined {
  return rules.get(id);
}

export function getAllRules(): FairnessRule[] {
  return Array.from(rules.values());
}

export function getRulesByPriority(): FairnessRule[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(rules.values()).sort((a, b) => order[a.priority] - order[b.priority]);
}

export function initFairnessRegistry(): void {
  for (const rule of allFairnessRules) {
    rules.set(rule.id, rule);
  }
}

export function clearRegistry(): void {
  rules.clear();
}

export function getRuleCount(): number {
  return rules.size;
}
