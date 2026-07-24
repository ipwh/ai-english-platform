// ============================================
// Sprint 115: Human Review Registry
// ============================================

import type { HumanReviewRule } from './human-review-types';
import { allHumanReviewRules } from './rules';

const rules = new Map<string, HumanReviewRule>();

export function registerRule(rule: HumanReviewRule): void { rules.set(rule.id, rule); }
export function getRule(id: string): HumanReviewRule | undefined { return rules.get(id); }
export function getAllRules(): HumanReviewRule[] { return Array.from(rules.values()); }

export function getRulesByPriority(): HumanReviewRule[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(rules.values()).sort((a, b) => order[a.priority] - order[b.priority]);
}

export function initHumanReviewRegistry(): void {
  for (const rule of allHumanReviewRules) rules.set(rule.id, rule);
}

export function clearRegistry(): void { rules.clear(); }
export function getRuleCount(): number { return rules.size; }
