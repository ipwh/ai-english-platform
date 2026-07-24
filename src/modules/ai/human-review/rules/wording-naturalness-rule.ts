// ============================================
// Sprint 115: Wording Naturalness Rule
// Detects AI-sounding language — overly uniform, stiff, or repetitive patterns.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

const AI_TELLS = [
  'it is important to note', 'it should be noted that', 'it is worth mentioning',
  'one could argue that', 'it can be said that', 'it is generally believed',
  'in today\'s society', 'in modern times', 'nowadays',
  'first and foremost', 'last but not least', 'in conclusion',
  'it is widely acknowledged', 'needless to say', 'it goes without saying',
];

export const wordingNaturalnessRule: HumanReviewRule = {
  id: 'hr:wording-naturalness', name: 'Wording Naturalness', description: 'Detects AI-sounding, overly uniform language', priority: 'high',
  review(questions, ctx) {
    return questions.map((q, i) => {
      const text = pt(q.prompt || q.question || q.questionText || '') + ' ' +
        pt(q.explanationEn || '') + ' ' + pt(q.readingContent || '') + ' ' +
        pt(q.listeningContent || '');
      if (!text.trim()) return ok(this.id, i);

      const lower = text.toLowerCase();

      // AI tell phrases
      for (const tell of AI_TELLS) {
        if (lower.includes(tell)) {
          return warn(this.id, `AI-sounding phrase: "${tell}"`, 'Remove formulaic AI expressions. Write more naturally.', i);
        }
      }

      // All sentences start with same word
      const sentences = text.split(/[.!?]+/).filter(Boolean).map(s => s.trim());
      if (sentences.length >= 3) {
        const firstWords = sentences.map(s => s.split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
        const uniqueFirst = new Set(firstWords);
        if (uniqueFirst.size === 1 && firstWords.length >= 3) {
          return warn(this.id, `All ${firstWords.length} sentences start with "${firstWords[0]}"`, 'Vary sentence openings for natural flow.', i);
        }
      }

      return ok(this.id, i);
    });
  },
};
