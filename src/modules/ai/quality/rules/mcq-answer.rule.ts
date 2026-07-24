// ============================================
// Sprint 102: MCQAnswerRule
// Validates MC answer references one of the available options.
// Normalizes answer format: "A." → "A", "(C)" → "C", lowercase → uppercase.
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

interface HasMCQAnswer {
  type?: string;
  answer?: string;
  choices?: string[];
}

const MCQ_TYPES = new Set(['mc', 'mcq', 'mcCloze', 'trueFalseNG']);

export class MCQAnswerRule extends BaseQualityRule<HasMCQAnswer> {
  readonly id = 'mcq:answer';
  readonly name = 'MCQ Answer Reference Check';
  readonly description = 'Ensures MC answer is A/B/C/D and references a valid option';
  readonly priority = 'high' as const;
  readonly supportedTypes = ['GeneratedQuestion'];

  validate(input: HasMCQAnswer): RuleCheckResult {
    if (!input.type || !MCQ_TYPES.has(input.type.trim().toLowerCase())) {
      return this.pass();
    }

    const answer = (input.answer || '').trim();
    const choices = input.choices || [];

    if (!answer) {
      return this.fail('MC question has no answer');
    }

    // Normalize answer format
    const normalized = normalizeAnswerLetter(answer);

    if (!/^[A-D]$/.test(normalized)) {
      return this.fail(`MC answer "${answer}" is not a valid A-D letter`);
    }

    // Check that the referenced option exists
    const idx = normalized.charCodeAt(0) - 65;
    if (idx >= choices.length || !choices[idx] || choices[idx].trim().length === 0) {
      return this.fail(`MC answer "${normalized}" references option ${idx + 1} which is empty or missing`);
    }

    return this.pass();
  }

  repair(input: HasMCQAnswer): { repaired: boolean; output: HasMCQAnswer; changes: string[] } {
    if (!input.type || !MCQ_TYPES.has(input.type.trim().toLowerCase())) {
      return { repaired: false, output: input, changes: [] };
    }

    const answer = (input.answer || '').trim();
    if (!answer) {
      return { repaired: false, output: input, changes: [] };
    }

    const normalized = normalizeAnswerLetter(answer);

    if (normalized !== answer && /^[A-D]$/.test(normalized)) {
      return {
        repaired: true,
        output: { ...input, answer: normalized },
        changes: [`Normalized MC answer "${answer}" → "${normalized}"`],
      };
    }

    // Try matching answer text to a choice
    if (!/^[A-D]$/.test(normalized)) {
      const choices = input.choices || [];
      const normAnswer = answer.toLowerCase().replace(/^[a-d][.)]\s*/i, '').trim();
      for (let i = 0; i < Math.min(choices.length, 4); i++) {
        const choice = (choices[i] || '').trim().toLowerCase();
        if (choice === normAnswer || choice.includes(normAnswer) || normAnswer.includes(choice)) {
          const letter = String.fromCharCode(65 + i);
          return {
            repaired: true,
            output: { ...input, answer: letter },
            changes: [`Matched answer text "${answer}" to option ${letter}`],
          };
        }
      }
    }

    return { repaired: false, output: input, changes: [] };
  }
}

/** Normalize various answer formats to a single uppercase letter. */
function normalizeAnswerLetter(raw: string): string {
  let s = raw.trim();
  // Remove common wrappers: "A.", "(A)", "A)", "[A]", " A "
  s = s.replace(/^[.\s]*\(?\s*([A-Da-d])\s*\)?\s*[.)\]\s]*$/, '$1');
  // Just a letter
  const m = s.match(/^[A-Da-d]$/);
  if (m) return m[0].toUpperCase();
  return s.toUpperCase();
}
