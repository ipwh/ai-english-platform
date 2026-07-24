// ============================================
// Sprint 111: Calibration Registry
// Open/Closed: new rules auto-register.
// ============================================

import type { CalibrationRule } from './calibration-types';
import { allCalibrationRules } from './rules/calibration-rules';

const rules = new Map<string, CalibrationRule>();

/** Register a calibration rule */
export function registerRule(rule: CalibrationRule): void {
  rules.set(rule.id, rule);
}

/** Get a rule by ID */
export function getRule(id: string): CalibrationRule | undefined {
  return rules.get(id);
}

/** Get all registered rules */
export function getAllRules(): CalibrationRule[] {
  return Array.from(rules.values());
}

/** Get rules sorted by priority */
export function getRulesByPriority(): CalibrationRule[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(rules.values()).sort((a, b) => order[a.priority] - order[b.priority]);
}

/** Initialize registry with all built-in rules */
export function initCalibrationRegistry(): void {
  for (const rule of allCalibrationRules) {
    rules.set(rule.id, rule);
  }
}

/** Clear all rules */
export function clearRegistry(): void {
  rules.clear();
}

/** Get rule count */
export function getRuleCount(): number {
  return rules.size;
}

/** Check if a rule is registered */
export function hasRule(id: string): boolean {
  return rules.has(id);
}
