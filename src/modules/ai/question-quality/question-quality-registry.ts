// ============================================
// Sprint 113: Question Quality Registry
// ============================================

import type { QuestionQualityRule } from './question-quality-types';
import { allQuestionQualityRules } from './rules/question-quality-rules';

const rules = new Map<string, QuestionQualityRule>();

export function registerRule(rule: QuestionQualityRule): void {
  rules.set(rule.id, rule);
}

export function getRule(id: string): QuestionQualityRule | undefined {
  return rules.get(id);
}

export function getAllRules(): QuestionQualityRule[] {
  return Array.from(rules.values());
}

export function getRulesByPriority(): QuestionQualityRule[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(rules.values()).sort((a, b) => order[a.priority] - order[b.priority]);
}

export function initQuestionQualityRegistry(): void {
  for (const rule of allQuestionQualityRules) {
    rules.set(rule.id, rule);
  }
}

export function clearRegistry(): void {
  rules.clear();
}

export function getRuleCount(): number {
  return rules.size;
}
