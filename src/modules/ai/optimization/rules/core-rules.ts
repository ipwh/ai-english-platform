// ============================================
// Sprint 108: Optimization Rules — Batch 1 (P0)
// StudentTolerance, AnswerQuality, DistractorOptimization
// ============================================

import type { OptimizationRule, OptimizationCheck } from '../optimization-types';

const ok = (id: string): OptimizationCheck => ({ ruleId: id, passed: true, action: 'none', score: 1, priority: 'low', changes: [] });
const fix = (id: string, changes: string[], priority: OptimizationCheck['priority'] = 'high'): OptimizationCheck =>
  ({ ruleId: id, passed: false, action: 'repair', score: 0.5, priority, changes });
const flag = (id: string, msg: string): OptimizationCheck =>
  ({ ruleId: id, passed: false, action: 'flag', score: 0, priority: 'medium', message: msg, changes: [] });

// ═══ P0: StudentToleranceRule ═══
export const studentToleranceRule: OptimizationRule = {
  id: 'opt:student-tolerance', name: 'Student Tolerance', description: 'Accepts minor variations in student answers', priority: 'critical',
  optimize(q) {
    // This rule is applied at grading time, not question generation time.
    // It ensures the grading system is lenient on formatting differences.
    // Actual implementation: the Evaluation Engine already handles this via STANDARD policy.
    // This rule exists to flag when grading is too strict.
    return { question: q, check: ok(this.id) };
  },
};

// ═══ P0: AnswerQualityOptimization ═══
export const answerQualityRule: OptimizationRule = {
  id: 'opt:answer-quality', name: 'Answer Quality', description: 'Detects and repairs answer field issues', priority: 'critical',
  optimize(q) {
    const answer = String(q.answer || '').trim();
    if (!answer) {
      const repaired = { ...q, answer: '[Answer needed — awaiting generation]' };
      return { question: repaired, check: fix(this.id, ['Inserted placeholder for empty answer'], 'critical') };
    }
    if (answer === '.' || answer === '...' || answer === 'N/A' || answer === 'TBD') {
      const repaired = { ...q, answer: '[Answer placeholder replaced]' };
      return { question: repaired, check: fix(this.id, ['Replaced obvious placeholder'], 'high') };
    }
    // MC: check answer references valid option
    if ((q.type === 'mc' || q.type === 'mcq') && Array.isArray(q.choices) && q.choices.length >= 2) {
      const letter = answer.toUpperCase();
      if (/^[A-D]$/.test(letter)) {
        const idx = letter.charCodeAt(0) - 65;
        if (idx >= q.choices.length || !q.choices[idx]?.trim()) {
          return { question: q, check: flag(this.id, `Answer ${letter} references out-of-range option`) };
        }
      }
    }
    return { question: q, check: ok(this.id) };
  },
};

// ═══ P1: DistractorOptimization ═══
export const distractorRule: OptimizationRule = {
  id: 'opt:distractor-quality', name: 'Distractor Quality', description: 'Improves MCQ distractor quality', priority: 'high',
  optimize(q) {
    if (q.type !== 'mc' && q.type !== 'mcq') return { question: q, check: ok(this.id) };
    const choices = (q.choices as string[]) || [];
    if (choices.length < 3) return { question: q, check: ok(this.id) };

    const changes: string[] = [];
    let modified = false;
    const result = [...choices];

    // Normalize length: if one option is much longer/shorter, flag it
    const lens = result.map(c => (c || '').trim().length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    for (let i = 0; i < result.length; i++) {
      if (lens[i] < avg * 0.4 && lens[i] > 0) {
        changes.push(`Option ${String.fromCharCode(65 + i)} is much shorter than average`);
      }
    }

    // Shuffle answer position if answer is always A
    const answer = String(q.answer || '').toUpperCase();
    if (answer === 'A' && q.choices && q.choices.length >= 3) {
      // Swap A with a random later position
      const swapIdx = 1 + Math.floor(Math.random() * (result.length - 1));
      [result[0], result[swapIdx]] = [result[swapIdx], result[0]];
      changes.push('Shuffled answer position away from A');
      modified = true;
    }

    return {
      question: modified ? { ...q, choices: result } : q,
      check: changes.length > 0 ? fix(this.id, changes, 'high') : ok(this.id),
    };
  },
};
