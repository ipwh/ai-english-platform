// ============================================
// Sprint 115 / Phase 4A: Reading Naturalness Rule (v2)
// Extended checks: sentence opening variety, formulaic patterns, flat structure
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'medium' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const readingNaturalnessRule: HumanReviewRule = {
  id: 'hr:reading-naturalness', name: 'Reading Naturalness',
  description: 'Passages should have natural paragraphs, varied sentences, organic transitions, and clear voice.',
  priority: 'medium',
  review(questions, ctx) {
    return questions.map((q, i) => {
      const content = pt(q.readingContent || q.passage || '');
      if (!content) return ok(this.id, i);

      // No paragraphs
      if (content.length > 200 && !content.includes('\n') && !content.includes('\r')) {
        return warn(this.id, 'Passage is a single block with no paragraph breaks',
          'Break long passages into natural paragraphs.', i);
      }

      const sentences = content.split(/[.!?]+/).filter(Boolean).map(s => s.trim());
      if (sentences.length < 3) return ok(this.id, i);

      const lengths = sentences.map(s => s.length);
      const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;

      // ── Phase 4A: Specific checks first, general checks last ──

      // Phase 4A: Formulaic transition overuse
      const formulaicTransitions = ['furthermore', 'moreover', 'in addition', 'additionally'];
      const formulaicCount = formulaicTransitions.reduce(
        (c, t) => c + (content.toLowerCase().match(new RegExp(`\\b${t}\\b`, 'gi')) || []).length, 0,
      );
      if (formulaicCount >= 3) {
        return warn(this.id,
          `Passage uses formulaic transitions ${formulaicCount} times — sounds template-driven`,
          'Replace some formulaic transitions with organic flow or contrast markers.', i);
      }

      // Phase 4A: Repeated sentence openings
      const openings = sentences.map(s => {
        const words = s.split(/\s+/);
        return words.slice(0, 2).join(' ').toLowerCase();
      });
      const openingCounts = new Map<string, number>();
      for (const o of openings) openingCounts.set(o, (openingCounts.get(o) || 0) + 1);
      const maxOpeningRepeat = Math.max(...openingCounts.values());
      if (maxOpeningRepeat >= 4) {
        const repeated = [...openingCounts.entries()].find(([, c]) => c >= 4);
        return warn(this.id,
          `Sentence opening "${repeated?.[0]}" appears ${repeated?.[1]} times — repetitive rhythm`,
          'Vary how sentences begin (e.g., start with adverbs, prepositional phrases, or different subjects).', i);
      }

      // Phase 4A: Flat paragraph structure
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 30);
      if (paragraphs.length >= 4) {
        const paraLens = paragraphs.map(p => p.trim().split(/\s+/).length);
        const avgPara = paraLens.reduce((a, b) => a + b, 0) / paraLens.length;
        const paraUniform = paraLens.every(l => Math.abs(l - avgPara) < avgPara * 0.25);
        if (paraUniform && avgPara > 40) {
          return warn(this.id,
            'All paragraphs are roughly the same length — lacks rhetorical shape',
            'Vary paragraph length: some shorter for impact, some longer for development.', i);
        }
      }

      // No transition words at all
      const transitions = ['however', 'therefore', 'although', 'while', 'despite',
        'nevertheless', 'in contrast', 'on the other hand', 'consequently'];
      const hasTransitions = transitions.some(t => content.toLowerCase().includes(t));
      if (!hasTransitions && sentences.length >= 5) {
        return warn(this.id, 'Passage lacks transition or contrast words — may feel flat',
          'Add contrast words (however, although, while) for rhetorical shape.', i);
      }

      // All sentences roughly same length (robotic) — check LAST, least specific
      const allSimilar = lengths.every(l => Math.abs(l - avgLen) < avgLen * 0.3);
      if (allSimilar) {
        return warn(this.id, 'All sentences are roughly the same length — sounds robotic',
          'Vary sentence length for natural reading rhythm.', i);
      }

      return ok(this.id, i);
    });
  },
};
