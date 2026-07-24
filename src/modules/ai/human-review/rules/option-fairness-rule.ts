// ============================================
// Sprint 115: Option Fairness Rule
// All 4 options should be similar in length, structure, and information density.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const optionFairnessRule: HumanReviewRule = {
  id: 'hr:option-fairness', name: 'Option Fairness', description: 'All options should be similar in length, structure, and information', priority: 'high',
  review(questions, ctx) {
    return questions.map((q, i) => {
      if (!Array.isArray(q.choices) || q.choices.length < 3) return ok(this.id, i);
      const choices = (q.choices as string[]).map(c => pt(c));
      const lengths = choices.map(c => c.length);
      const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const maxLen = Math.max(...lengths);
      const minLen = Math.min(...lengths);

      // Length variance too high
      if (maxLen > minLen * 2.5 && avgLen > 20) {
        return warn(this.id,
          `Option lengths vary widely (${minLen}-${maxLen} chars, ${Math.round(maxLen / minLen)}x)`,
          'Keep all options similar in length to avoid giving away the answer.', i);
      }

      // Word count variance
      const wordCounts = choices.map(c => c.split(/\s+/).length);
      const maxWords = Math.max(...wordCounts);
      const minWords = Math.min(...wordCounts);
      if (maxWords > minWords * 3 && maxWords > 5) {
        return warn(this.id,
          `Option word counts vary widely (${minWords}-${maxWords} words)`,
          'All options should have similar information density.', i);
      }

      // Grammatical inconsistency: some are full sentences, some fragments
      const isSentence = choices.map(c => /^[A-Z].*[.!?]$/.test(c) || c.split(/\s+/).length > 5);
      const sentenceCount = isSentence.filter(Boolean).length;
      if (sentenceCount > 0 && sentenceCount < choices.length) {
        return warn(this.id,
          `${sentenceCount}/${choices.length} options are full sentences, others are fragments`,
          'Make all options grammatically consistent — all sentences or all phrases.', i);
      }

      return ok(this.id, i);
    });
  },
};
