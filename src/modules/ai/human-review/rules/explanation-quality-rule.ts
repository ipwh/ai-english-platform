// ============================================
// Sprint 115: Explanation Quality Rule (Human Review)
// Rejects "A is correct" — demands real pedagogical explanation.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const fail = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0, detail: d, suggestion: s, questionIndex: qi, priority: 'critical' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.3, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

const WEAK_EXPLANATIONS = [
  /^(because\s+)?[a-d]\s+is\s+correct\.?$/i,
  /^the\s+answer\s+is\s+[a-d]\.?$/i,
  /^correct\s+answer\s+is\s+[a-d]\.?$/i,
  /^option\s+[a-d]\s+is\s+correct\.?$/i,
  /^[a-d]\s*[.。]\s*$/i,
  /^正確答案/i,
];

export const explanationQualityRule: HumanReviewRule = {
  id: 'hr:explanation-quality', name: 'Explanation Quality (Human Review)', description: 'Rejects superficial explanations, demands real teaching', priority: 'critical',
  review(questions, ctx) {
    return questions.map((q, i) => {
      const en = pt(q.explanationEn || '');
      const zh = pt(q.explanationZh || '');

      // Missing explanation
      if (!en && !zh) {
        return fail(this.id, 'Both explanations missing', 'Every question needs a bilingual explanation.', i);
      }

      // Too short (less than 30 chars)
      if (en.length > 0 && en.length < 30) {
        return fail(this.id, `English explanation too short (${en.length} chars)`, 'Write at least 30 characters explaining why the answer is correct.', i);
      }
      if (zh.length > 0 && zh.length < 15) {
        return fail(this.id, `Chinese explanation too short (${zh.length} chars)`, 'Write at least 15 characters explaining why the answer is correct.', i);
      }

      // Superficial pattern
      for (const pattern of WEAK_EXPLANATIONS) {
        if (pattern.test(en)) {
          return fail(this.id, `Superficial explanation: "${en}"`, 'Explain WHY each wrong option is incorrect. A real teacher would elaborate.', i);
        }
      }

      // Doesn't mention other options
      if (Array.isArray(q.choices) && q.choices.length >= 3) {
        const mentionsOthers = (q.choices as string[]).filter((_, k) => {
          const choiceText = pt((q.choices as string[])[k]).toLowerCase();
          return en.toLowerCase().includes(choiceText.substring(0, 4)) ||
                 zh.includes(choiceText.substring(0, 2));
        }).length;
        if (mentionsOthers <= 1 && en.length > 30) {
          return warn(this.id, 'Explanation does not discuss why other options are wrong', 'A good explanation clarifies why each distractor is incorrect.', i);
        }
      }

      return ok(this.id, i);
    });
  },
};
