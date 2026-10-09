// ============================================
// Sprint 105: Exact Match Rule
// ============================================

import type { EvaluationRule } from '../evaluation-types';

export const exactMatchRule: EvaluationRule = {
  name: 'exact-match',
  description: 'Checks if student answer exactly matches reference answer',
  evaluate(student, reference, _config) {
    const passed = student.trim() === reference.trim();
    return { ruleName: this.name, passed, score: passed ? 1 : 0 };
  },
};
