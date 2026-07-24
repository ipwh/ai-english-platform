// ============================================
// Sprint 115: Answer Support Rule
// Every answer must be supported by passage/transcript/prompt evidence.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const fail = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0, detail: d, suggestion: s, questionIndex: qi, priority: 'critical' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.3, detail: d, suggestion: s, questionIndex: qi, priority: 'high' });

function pt(s: unknown): string { return String(s ?? '').trim().toLowerCase(); }

export const answerSupportRule: HumanReviewRule = {
  id: 'hr:answer-support', name: 'Answer Support', description: 'Ensures answers are supported by passage, transcript, or prompt', priority: 'critical',
  review(questions, ctx) {
    const passage = pt(ctx?.passageContent || '');
    const transcript = pt(ctx?.transcriptContent || '');
    const isReading = !!passage;
    const isListening = !!transcript;

    return questions.map((q, i) => {
      const answer = pt(q.answer);
      if (!answer) return ok(this.id, i);

      const prompt = pt(q.prompt || q.question || q.questionText || '');
      const explanation = pt(q.explanationEn || '');

      // Reading: answer should appear in passage or be clearly inferable
      if (isReading && answer.length > 2) {
        if (!passage.includes(answer)) {
          const words = answer.split(/\s+/);
          const foundWords = words.filter(w => passage.includes(w));
          if (foundWords.length < words.length * 0.4) {
            return fail(this.id,
              `Answer "${answer}" not supported by passage content`,
              'Ensure the answer is directly supported by or clearly inferable from the passage.', i);
          }
        }
      }

      // Listening: answer should be in transcript
      if (isListening && answer.length > 2) {
        if (!transcript.includes(answer)) {
          return warn(this.id,
            `Answer "${answer}" not found verbatim in transcript`,
            'Listening answers should be directly supported by the transcript.', i);
        }
      }

      // General: answer must make sense with the question
      if (prompt && answer) {
        const promptWords = new Set(prompt.split(/\s+/));
        const answerWords = answer.split(/\s+/);
        const overlap = answerWords.filter(w => promptWords.has(w)).length;
        // If answer is literally in the question, it's a giveaway
        if (answerWords.length >= 2 && overlap === answerWords.length && answer.length > 5) {
          return warn(this.id,
            `Answer "${answer}" appears verbatim in the question prompt`,
            'Avoid putting the exact answer in the question stem.', i);
        }
      }

      return ok(this.id, i);
    });
  },
};
