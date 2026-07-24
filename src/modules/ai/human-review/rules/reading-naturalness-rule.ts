// ============================================
// Sprint 115: Reading Naturalness Rule
// Passages should read naturally with paragraphs, transitions, and varied tone.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'medium' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const readingNaturalnessRule: HumanReviewRule = {
  id: 'hr:reading-naturalness', name: 'Reading Naturalness', description: 'Passages should have natural paragraphs, transitions, and tone', priority: 'medium',
  review(questions, ctx) {
    return questions.map((q, i) => {
      const content = pt(q.readingContent || q.passage || '');
      if (!content) return ok(this.id, i);

      // No paragraphs
      if (content.length > 200 && !content.includes('\n') && !content.includes('\r')) {
        return warn(this.id, 'Passage is a single block with no paragraph breaks', 'Break long passages into natural paragraphs.', i);
      }

      // All sentences roughly same length (robotic)
      const sentences = content.split(/[.!?]+/).filter(Boolean).map(s => s.trim());
      if (sentences.length >= 5) {
        const lengths = sentences.map(s => s.length);
        const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const allSimilar = lengths.every(l => Math.abs(l - avg) < avg * 0.3);
        if (allSimilar) {
          return warn(this.id, 'All sentences are roughly the same length — sounds robotic', 'Vary sentence length for natural reading rhythm.', i);
        }
      }

      // No transition words
      const transitions = ['however', 'therefore', 'furthermore', 'moreover', 'in addition', 'on the other hand',
        'meanwhile', 'consequently', 'as a result', 'nevertheless', 'in contrast', 'similarly'];
      const hasTransitions = transitions.some(t => content.toLowerCase().includes(t));
      if (!hasTransitions && sentences.length >= 5) {
        return warn(this.id, 'Passage lacks transition words — may feel choppy', 'Add transition words (however, therefore, in addition) for flow.', i);
      }

      return ok(this.id, i);
    });
  },
};
