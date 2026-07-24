// ============================================
// Sprint 114: Adaptive Registry
// ============================================

import type { AdaptiveRule } from './adaptive-types';
import { allAdaptiveRules } from './rules/adaptive-rules';

const rules = new Map<string, AdaptiveRule>();

export function registerRule(rule: AdaptiveRule): void { rules.set(rule.id, rule); }
export function getRule(id: string): AdaptiveRule | undefined { return rules.get(id); }
export function getAllRules(): AdaptiveRule[] { return Array.from(rules.values()); }

export function getRulesByPriority(): AdaptiveRule[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(rules.values()).sort((a, b) => order[a.priority] - order[b.priority]);
}

export function initAdaptiveRegistry(): void {
  for (const rule of allAdaptiveRules) rules.set(rule.id, rule);
}

export function clearRegistry(): void { rules.clear(); }
export function getRuleCount(): number { return rules.size; }
