// ============================================
// Sprint 103: AnswerConsistencyRule
// Validates that answer is internally consistent with question type and choices.
// Detects: answer not matching options, contradictory explanation.
// Category: heuristic
// ============================================

import { BaseQualityRule } from '../../quality-rule';
import type { RuleCheckResult } from '../../quality-types';

interface HasAnswerConsistency {
  type?: string;
  answer?: string;
  choices?: string[];
  explanationZh?: string;
  explanationEn?: string;
}

const MCQ_TYPES = new Set(['mc', 'mcq', 'mcCloze', 'trueFalseNG']);

export class AnswerConsistencyRule extends BaseQualityRule<HasAnswerConsistency> {
  readonly id = 'content:answer-consistency';
  readonly name = 'Answer Content Consistency';
  readonly description = 'Validates answer matches choices and is internally consistent';
  readonly priority = 'critical' as const;
  readonly supportedTypes = ['GeneratedQuestion'];
  readonly category = 'heuristic' as const;
  readonly dimension = 'consistency' as const;

  validate(input: HasAnswerConsistency): RuleCheckResult {
    const failures: Array<{ ruleId: string; message: string }> = [];
    const warnings: string[] = [];
    const type = (input.type || '').trim().toLowerCase();
    const answer = (input.answer || '').trim();
    const choices = input.choices || [];

    if (!answer) return this.pass(); // covered by AnswerFieldRule

    // MC: answer must match exactly one choice
    if (MCQ_TYPES.has(type) && choices.length > 0) {
      const idx = answer.toUpperCase().charCodeAt(0) - 65;
      if (idx < 0 || idx >= choices.length) {
        failures.push({ ruleId: this.id, message: `MC answer "${answer}" does not reference any valid option (A-${String.fromCharCode(64 + Math.min(choices.length, 4))})` });
      } else {
        const matched = choices[idx];
        // Check if matched choice is empty
        if (!matched || matched.trim().length === 0) {
          failures.push({ ruleId: this.id, message: `MC answer "${answer}" references empty option ${idx + 1}` });
        }
      }
    }

    // Check explanation doesn't contradict the answer (heuristic: look for opposite signals)
    if (answer && input.explanationZh) {
      const exp = input.explanationZh.toLowerCase();
      // If answer is a letter (MC), check that the explanation doesn't name a different letter
      if (/^[A-D]$/i.test(answer)) {
        const mentionedLetters = exp.match(/[a-d][).\s]|選項\s*[a-d]|[a-d]\s*是正確|correct.*[a-d]|答案.*[a-d]|[a-d].*正確/gi);
        if (mentionedLetters) {
          for (const m of mentionedLetters) {
            const letter = m.match(/[a-d]/i)?.[0]?.toUpperCase();
            if (letter && letter !== answer.toUpperCase()) {
              warnings.push(`Explanation mentions option ${letter} but answer is ${answer.toUpperCase()} — possible contradiction`);
            }
          }
        }
      }
      // Check if explanation says "correct" but answer field is clearly wrong format
      if (exp.includes('正確') || exp.includes('correct')) {
        // Good — explanation aligns with having an answer
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
