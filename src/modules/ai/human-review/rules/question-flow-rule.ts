// ============================================
// Sprint 115: Question Flow Rule
// Checks natural flow across entire question set — not all "Which of..."
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'medium' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const questionFlowRule: HumanReviewRule = {
  id: 'hr:question-flow', name: 'Question Flow', description: 'Ensures natural variety in question wording across the set', priority: 'medium',
  review(questions, ctx) {
    if (questions.length < 3) return questions.map((q, i) => ok(this.id, i));

    const starters: string[] = [];
    for (const q of questions) {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      const firstWord = prompt.split(/\s+/)[0]?.toLowerCase() || '';
      starters.push(firstWord);
    }

    // Count same starters
    const counts: Record<string, number> = {};
    for (const s of starters) counts[s] = (counts[s] || 0) + 1;

    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      // "Which of the following" on 4+ questions
      if (/\bwhich of the following\b/i.test(prompt)) {
        const wofCount = questions.filter(qq =>
          /\bwhich of the following\b/i.test(pt(qq.prompt || qq.question || qq.questionText || '')),
        ).length;
        if (wofCount >= questions.length * 0.6 && questions.length >= 5) {
          return warn(this.id,
            `"Which of the following" appears on ${wofCount}/${questions.length} questions`,
            'Vary question formats: use "What", "Why", "How", true/false, fill-in-blank, matching.', i);
        }
      }

      // Same starter dominating
      const firstWord = starters[i];
      if (counts[firstWord] >= questions.length * 0.7 && questions.length >= 4) {
        return warn(this.id,
          `"${firstWord}" starts ${counts[firstWord]}/${questions.length} questions`,
          'Rotate question starters for natural variety.', i);
      }

      return ok(this.id, i);
    });
  },
};
