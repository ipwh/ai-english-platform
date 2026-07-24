// ============================================
// Sprint 115: Distractor Naturalness Rule
// Rejects obviously wrong, length-mismatched, or format-inconsistent distractors.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const fail = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0, detail: d, suggestion: s, questionIndex: qi, priority: 'critical' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const distractorNaturalnessRule: HumanReviewRule = {
  id: 'hr:distractor-naturalness', name: 'Distractor Naturalness', description: 'Ensures wrong answers look plausible to students', priority: 'critical',
  review(questions, ctx) {
    return questions.map((q, i) => {
      if (!Array.isArray(q.choices) || q.choices.length < 3) return ok(this.id, i);
      const choices = (q.choices as string[]).map(c => pt(c));
      const lengths = choices.map(c => c.length);
      const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const answer = pt(q.answer);
      const answerIdx = choices.findIndex(c => pt(c).toLowerCase() === answer.toLowerCase());

      for (let j = 0; j < choices.length; j++) {
        // Obviously wrong: single word when others are sentences
        if (choices[j].split(/\s+/).length <= 1 && avgLen > 30) {
          return fail(this.id,
            `Choice ${String.fromCharCode(65 + j)} is a single word while others are sentences`,
            'Make all options similar in structure and length.', i);
        }
        // Length gap > 3x
        if (lengths[j] > avgLen * 3 && avgLen > 10) {
          return warn(this.id,
            `Choice ${String.fromCharCode(65 + j)} is ${Math.round(lengths[j] / avgLen)}x longer than average`,
            'Keep option lengths balanced.', i);
        }
        // Correct answer is noticeably longer (teacher giveaway)
        if (j === answerIdx && lengths[j] > avgLen * 1.5 && avgLen > 15) {
          return warn(this.id,
            `Correct answer (${String.fromCharCode(65 + j)}) is ${Math.round(lengths[j] / avgLen)}x longer — dead giveaway`,
            'The correct answer should not stand out by length.', i);
        }
        // Different format: starts with number when others don't
        const startsWithNum = /^\d/.test(choices[j]);
        const othersWithNum = choices.filter((_, k) => k !== j && /^\d/.test(choices[k])).length;
        if (startsWithNum && othersWithNum === 0 && choices.length >= 4) {
          return warn(this.id,
            `Choice ${String.fromCharCode(65 + j)} starts with a number while others don't`,
            'Keep option formatting consistent.', i);
        }
      }
      return ok(this.id, i);
    });
  },
};
