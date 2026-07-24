// ============================================
// Sprint 115: Integrated Skills Flow Rule
// Reading → Listening → Writing must share a natural scenario continuation.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'medium' });

function pt(s: unknown): string { return String(s ?? '').trim().toLowerCase(); }

export const integratedSkillsFlowRule: HumanReviewRule = {
  id: 'hr:integrated-skills-flow', name: 'Integrated Skills Flow', description: 'Reading/Listening/Writing should flow as a natural scenario', priority: 'medium',
  review(questions, ctx) {
    const hasReading = questions.some(q => pt(q.type || '').includes('reading'));
    const hasListening = questions.some(q => pt(q.type || '').includes('listening'));
    const hasWriting = questions.some(q => pt(q.type || '').includes('writing'));
    const activeCount = [hasReading, hasListening, hasWriting].filter(Boolean).length;

    if (activeCount < 2) return questions.map((q, i) => ok(this.id, i));

    // Extract key nouns from each section
    const readingNouns = extractKeyNouns(questions.filter(q => pt(q.type || '').includes('reading')).map(q => pt(q.readingContent || q.passage || '')).join(' '));
    const listeningNouns = extractKeyNouns(questions.filter(q => pt(q.type || '').includes('listening')).map(q => pt(q.listeningContent || q.transcript || '')).join(' '));
    const writingNouns = extractKeyNouns(questions.filter(q => pt(q.type || '').includes('writing')).map(q => pt(q.prompt || q.question || '')).join(' '));

    return questions.map((q, i) => {
      const type = pt(q.type || q.questionType || '');
      if (!type) return ok(this.id, i);

      // Check if this section shares nouns with other sections
      const myNouns = extractKeyNouns(pt(q.readingContent || q.listeningContent || q.prompt || q.question || ''));
      let sharedWith = 0;

      if (type.includes('reading')) {
        const overlap = myNouns.filter(n => listeningNouns.includes(n) || writingNouns.includes(n));
        sharedWith = overlap.length;
      } else if (type.includes('listening')) {
        const overlap = myNouns.filter(n => readingNouns.includes(n) || writingNouns.includes(n));
        sharedWith = overlap.length;
      } else if (type.includes('writing')) {
        const overlap = myNouns.filter(n => readingNouns.includes(n) || listeningNouns.includes(n));
        sharedWith = overlap.length;
      }

      if (sharedWith === 0 && activeCount >= 3) {
        return warn(this.id,
          `No shared scenario terms between this ${type} section and other sections`,
          'Integrated skills should share a common theme/topic across reading, listening, and writing.', i);
      }

      return ok(this.id, i);
    });
  },
};

function extractKeyNouns(text: string): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 4);
  // Simple heuristic: filter out common stop words
  const stopWords = new Set(['about', 'which', 'their', 'there', 'would', 'could', 'should', 'these', 'those', 'what', 'when', 'where']);
  return [...new Set(words.filter(w => !stopWords.has(w)))];
}
