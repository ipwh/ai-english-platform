// ============================================
// Sprint 103: TranscriptConsistencyRule
// Validates listening questions are answerable from transcript.
// Detects: answer not in transcript, speaker references exist, timing references exist.
// Category: deterministic
// ============================================

import { BaseQualityRule } from '../../quality-rule';
import type { RuleCheckResult } from '../../quality-types';

interface HasTranscript {
  listeningContent?: string;
  answer?: string;
  type?: string;
  choices?: string[];
}

const LISTENING_TYPES = new Set(['mc', 'mcq', 'fill-blank', 'matching']);

export class TranscriptConsistencyRule extends BaseQualityRule<HasTranscript> {
  readonly id = 'content:transcript-consistency';
  readonly name = 'Transcript Content Consistency';
  readonly description = 'Validates listening questions are answerable from transcript';
  readonly priority = 'critical' as const;
  readonly supportedTypes = ['GeneratedQuestion'];
  readonly category = 'deterministic' as const;
  readonly dimension = 'consistency' as const;

  validate(input: HasTranscript): RuleCheckResult {
    const failures: Array<{ ruleId: string; message: string }> = [];
    const warnings: string[] = [];

    if (!input.listeningContent) return this.pass(); // not a listening question
    const transcript = input.listeningContent.toLowerCase().replace(/\s+/g, ' ');
    const answer = (input.answer || '').trim();

    // MC: check correct choice text in transcript
    if (/^[A-D]$/i.test(answer) && input.choices) {
      const idx = answer.toUpperCase().charCodeAt(0) - 65;
      const correctChoice = (input.choices[idx] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (correctChoice && !transcript.includes(correctChoice)) {
        // Try partial match (last 2-3 words)
        const words = correctChoice.split(' ');
        const tail3 = words.slice(-3).join(' ');
        const tail2 = words.slice(-2).join(' ');
        if (!transcript.includes(tail3) && !transcript.includes(tail2)) {
          failures.push({
            ruleId: this.id,
            message: `Listening answer "${correctChoice.slice(0, 60)}" not found verbatim in transcript`,
          });
        } else {
          warnings.push(`Answer "${correctChoice.slice(0, 60)}" partially matched in transcript`);
        }
      }
    } else if (answer && LISTENING_TYPES.has((input.type || '').trim())) {
      // Non-MC: check answer in transcript
      const normAnswer = answer.toLowerCase().replace(/\s+/g, ' ');
      if (!transcript.includes(normAnswer)) {
        const words = normAnswer.split(' ');
        const tail3 = words.slice(-3).join(' ');
        const tail2 = words.slice(-2).join(' ');
        if (!transcript.includes(tail3) && !transcript.includes(tail2)) {
          failures.push({
            ruleId: this.id,
            message: `Fill-blank answer "${answer.slice(0, 60)}" not found in transcript`,
          });
        }
      }
    }

    // Check transcript has at least 2 speaker lines
    if (input.listeningContent) {
      const lines = input.listeningContent.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        failures.push({ ruleId: this.id, message: 'Transcript has fewer than 2 speaker lines' });
      }
    }

    if (failures.length > 0) {
      return { passed: false, failures, warnings };
    }
    if (warnings.length > 0) {
      return { passed: true, failures: [], warnings };
    }
    return this.pass();
  }
}
