// ============================================
// Sprint 115: Student Confusion Rule
// Simulates first-time reading — detects potential confusion points.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.3, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const studentConfusionRule: HumanReviewRule = {
  id: 'hr:student-confusion', name: 'Student Confusion Detection', description: 'Detects potential student confusion points', priority: 'high',
  review(questions, ctx) {
    const previousPrompts = (ctx?.previousQuestions || []).map(q => pt((q as Record<string, unknown>).prompt || (q as Record<string, unknown>).question || ''));

    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      // Unclear pronoun reference at start
      if (/^(it|this|that|these|those|they|he|she|him|her|them)\b/i.test(prompt) && i > 0) {
        const prevPrompt = previousPrompts[i - 1] || '';
        // Check if the pronoun could refer to the previous question
        const prevNouns = prevPrompt.match(/\b[A-Z][a-z]{3,}\b/g) || [];
        if (prevNouns.length > 0) {
          return warn(this.id,
            `Question starts with pronoun "${prompt.split(/\s+/)[0]}" — unclear reference`,
            `Specify what "${prompt.split(/\s+/)[0]}" refers to (e.g., "${prevNouns[0]}" from the previous question).`, i);
        }
      }

      // Missing context assumption
      if (prompt.length < 30 && !/\b(passage|text|article|story|paragraph|recording|audio|transcript)\b/i.test(prompt.toLowerCase())) {
        return warn(this.id,
          'Very short question may lack sufficient context',
          'Provide enough context so a student reading this for the first time understands.', i);
      }

      // Multiple unfamiliar terms in one sentence
      const words = prompt.split(/\s+/);
      const longWords = words.filter(w => w.length > 10);
      if (longWords.length >= 3) {
        return warn(this.id,
          `Contains ${longWords.length} long/unfamiliar words: ${longWords.join(', ')}`,
          'Simplify vocabulary or provide definitions for unfamiliar terms.', i);
      }

      return ok(this.id, i);
    });
  },
};
