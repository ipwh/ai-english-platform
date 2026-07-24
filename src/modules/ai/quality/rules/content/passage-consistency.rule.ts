// ============================================
// Sprint 103: PassageConsistencyRule
// Validates that reading comprehension questions are answerable from provided passage.
// Detects: missing evidence, hallucinated facts, unanswerable questions.
// Category: heuristic
// ============================================

import { BaseQualityRule } from '../../quality-rule';
import type { RuleCheckResult } from '../../quality-types';

interface HasPassage {
  readingContent?: string;
  answer?: string;
  type?: string;
  prompt?: string;
  choices?: string[];
}

export class PassageConsistencyRule extends BaseQualityRule<HasPassage> {
  readonly id = 'content:passage-consistency';
  readonly name = 'Passage Content Consistency';
  readonly description = 'Validates reading questions are answerable from the passage';
  readonly priority = 'critical' as const;
  readonly supportedTypes = ['GeneratedQuestion'];
  readonly category = 'heuristic' as const;
  readonly dimension = 'consistency' as const;

  validate(input: HasPassage): RuleCheckResult {
    const failures: Array<{ ruleId: string; message: string }> = [];
    const warnings: string[] = [];
    const type = (input.type || '').trim();

    if (!input.readingContent) return this.pass(); // not a reading question
    const passage = input.readingContent.toLowerCase();
    const answer = (input.answer || '').trim();

    // For any question with reading content, check answer key terms
    // (previously only checked for specific reading types)
    if (answer) {
      // MC: check the correct choice text
      if (/^[A-D]$/i.test(answer) && input.choices) {
        const idx = answer.toUpperCase().charCodeAt(0) - 65;
        const correctChoice = (input.choices[idx] || '').trim();
        if (correctChoice) {
          const terms = extractKeyTerms(correctChoice);
          const missing = terms.filter(t => !passage.includes(t));
          if (missing.length === terms.length && terms.length > 1) {
            failures.push({
              ruleId: this.id,
              message: `Correct answer "${correctChoice.slice(0, 60)}" has no key terms found in passage — possible hallucination`,
            });
          } else if (missing.length > 0) {
            warnings.push(`Some key terms from answer not found in passage: ${missing.join(', ')}`);
          }
        }
      } else if (answer) {
        // Non-MC: check answer itself
        const terms = extractKeyTerms(answer);
        const missing = terms.filter(t => !passage.includes(t));
        if (missing.length === terms.length && terms.length > 1) {
          failures.push({
            ruleId: this.id,
            message: `Short answer "${answer.slice(0, 60)}" has no key terms found in passage`,
          });
        }
      }
    }

    // Check passage is not too short to support questions
    if (passage.length < 50) {
      failures.push({ ruleId: this.id, message: 'Passage is too short (<50 chars) to support comprehension questions' });
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

/** Extract meaningful key terms (words > 3 chars, skip stopwords). */
function extractKeyTerms(text: string): string[] {
  const stopwords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
    'were', 'their', 'they', 'will', 'would', 'about', 'which', 'there',
    'also', 'than', 'into', 'more', 'some', 'these', 'other', 'such',
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w));
}
