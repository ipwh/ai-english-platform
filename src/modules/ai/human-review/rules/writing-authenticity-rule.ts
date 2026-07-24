// ============================================
// Sprint 115: Writing Authenticity Rule
// Writing prompts should feel like a real teacher wrote them, not an LLM.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const fail = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0, detail: d, suggestion: s, questionIndex: qi, priority: 'critical' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.3, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

const AUTHENTIC_OPENERS = [
  'your school', 'your class', 'your teacher', 'the school magazine',
  'the student newsletter', 'the principal', 'your friend', 'a local newspaper',
  'a letter to', 'an email to', 'a speech for', 'a blog post about',
  'you are a', 'imagine you are', 'as a student', 'as a member of',
];

const GENERIC_OPENERS = ['write an essay', 'write a letter', 'write about', 'discuss the', 'describe the'];

export const writingAuthenticityRule: HumanReviewRule = {
  id: 'hr:writing-authenticity', name: 'Writing Authenticity', description: 'Writing prompts should feel like a real teacher wrote them', priority: 'critical',
  review(questions, ctx) {
    const isWriting = questions.some(q =>
      pt(q.type || q.questionType || '').includes('writing') ||
      pt(q.prompt || q.question || '').toLowerCase().includes('write'),
    );
    if (!isWriting) return questions.map((q, i) => ok(this.id, i));

    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      const lower = prompt.toLowerCase();

      // Generic opener detected
      for (const opener of GENERIC_OPENERS) {
        if (lower.startsWith(opener)) {
          return fail(this.id,
            `Generic writing prompt: starts with "${opener}"`,
            'Add authentic context: "Your school magazine is asking for articles about..."', i);
        }
      }

      // Check for authentic context elements
      let authenticScore = 0;
      for (const opener of AUTHENTIC_OPENERS) {
        if (lower.includes(opener)) authenticScore++;
      }

      if (authenticScore === 0 && prompt.length > 20) {
        return warn(this.id,
          'Writing prompt lacks authentic context (no mention of school, magazine, friend, etc.)',
          'Ground the prompt in a realistic scenario students can relate to.', i);
      }

      // Check for audience
      if (!/\b(to|for|audience|reader|recipient)\b/i.test(lower)) {
        return warn(this.id, 'Writing prompt does not specify target audience', 'Always tell students WHO they are writing for.', i);
      }

      return ok(this.id, i);
    });
  },
};
