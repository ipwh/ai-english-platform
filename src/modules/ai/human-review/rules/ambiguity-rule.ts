// ============================================
// Sprint 115: Ambiguity Rule
// Detects questions where multiple answers could be correct.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const fail = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0, detail: d, suggestion: s, questionIndex: qi, priority: 'critical' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.3, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim().toLowerCase(); }

export const ambiguityRule: HumanReviewRule = {
  id: 'hr:ambiguity', name: 'Ambiguity Detection', description: 'Detects questions with multiple plausible answers', priority: 'critical',
  review(questions, ctx) {
    return questions.map((q, i) => {
      if (!Array.isArray(q.choices)) return ok(this.id, i);
      const choices = (q.choices as string[]).map(c => pt(c));
      const answer = pt(q.answer);

      // Check if any two choices are semantically interchangeable
      for (let j = 0; j < choices.length; j++) {
        for (let k = j + 1; k < choices.length; k++) {
          // Both choices are close to the answer
          const simA = wordOverlap(choices[j], answer);
          const simB = wordOverlap(choices[k], answer);
          if (simA > 0.6 && simB > 0.6 && j !== choices.indexOf(answer)) {
            return fail(this.id,
              `Choices ${String.fromCharCode(65 + j)} and ${String.fromCharCode(65 + k)} are both plausible`,
              'Clarify the distinction between these two options.', i);
          }
          // Opposite words in choices (always/never, all/none)
          if ((choices[j].includes('always') && choices[k].includes('never')) ||
              (choices[j].includes('all') && choices[k].includes('none'))) {
            return warn(this.id,
              `Choices ${String.fromCharCode(65 + j)} and ${String.fromCharCode(65 + k)} contain absolute opposites`,
              'Avoid absolute terms in distractors unless clearly justified.', i);
          }
        }
      }
      return ok(this.id, i);
    });
  },
};

function wordOverlap(a: string, b: string): number {
  const sa = new Set(a.split(/\s+/)), sb = new Set(b.split(/\s+/));
  const intersection = new Set([...sa].filter(w => sb.has(w) && w.length > 2));
  const union = new Set([...sa, ...sb]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
