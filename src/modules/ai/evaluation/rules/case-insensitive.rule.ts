// ============================================
// Sprint 105: Case Insensitive Rule
// ============================================
import type { EvaluationRule, GradingPolicyConfig } from '../evaluation-types';

export const caseInsensitiveRule: EvaluationRule = {
  name: 'case-insensitive',
  description: 'Checks if student answer matches ignoring case',
  evaluate(student, reference, _config) {
    const passed = student.trim().toLowerCase() === reference.trim().toLowerCase();
    return { ruleName: this.name, passed, score: passed ? 1 : 0 };
  },
};
