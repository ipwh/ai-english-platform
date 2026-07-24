// ============================================
// Sprint 115: Listening Naturalness Rule
// Transcripts should sound like real conversations, not robotic exchanges.
// ============================================

import type { HumanReviewRule, HumanReviewCheck, HumanReviewContext } from '../human-review-types';

const ok = (id: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qi, priority: 'low' });
const warn = (id: string, d: string, s?: string, qi = -1): HumanReviewCheck =>
  ({ ruleId: id, passed: false, score: 0.4, detail: d, suggestion: s, questionIndex: qi, priority: 'medium' });

function pt(s: unknown): string { return String(s ?? '').trim(); }

export const listeningNaturalnessRule: HumanReviewRule = {
  id: 'hr:listening-naturalness', name: 'Listening Naturalness', description: 'Transcripts should sound like real conversations', priority: 'medium',
  review(questions, ctx) {
    return questions.map((q, i) => {
      const content = pt(q.listeningContent || q.transcript || '');
      if (!content) return ok(this.id, i);

      // Too short — probably not a real conversation
      if (content.length < 50) {
        return warn(this.id, 'Transcript is very short — may not represent a real conversation', 'Extend the transcript with natural back-and-forth dialogue.', i);
      }

      // Only one speaker
      const speakerMatches = content.match(/([A-Z][a-z]+):/g) || [];
      const speakers = new Set(speakerMatches.map(s => s.replace(':', '')));
      if (speakers.size === 1 && content.length > 100) {
        return warn(this.id, 'Transcript appears to have only one speaker', 'Add a second speaker with natural dialogue exchanges.', i);
      }

      // All lines very short (robot exchange)
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      if (lines.length >= 6) {
        const shortLines = lines.filter(l => l.trim().length < 20);
        if (shortLines.length / lines.length > 0.7) {
          return warn(this.id, 'Most transcript lines are very short — sounds robotic', 'Include longer utterances for natural conversation flow.', i);
        }
      }

      return ok(this.id, i);
    });
  },
};
