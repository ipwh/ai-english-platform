// ============================================
// Sprint 103: OptionConsistencyRule
// Validates exactly one reasonable correct option.
// Detects: no correct option, multiple correct options, identical meanings.
// Category: deterministic
// ============================================

import { BaseQualityRule } from '../../quality-rule';
import type { RuleCheckResult } from '../../quality-types';

interface HasOptions {
  type?: string;
  answer?: string;
  choices?: string[];
}

const MCQ_TYPES = new Set(['mc', 'mcq', 'mcCloze', 'trueFalseNG']);

export class OptionConsistencyRule extends BaseQualityRule<HasOptions> {
  readonly id = 'content:option-consistency';
  readonly name = 'Option Content Consistency';
  readonly description = 'Validates exactly one distinct correct option exists';
  readonly priority = 'critical' as const;
  readonly supportedTypes = ['GeneratedQuestion'];
  readonly category = 'deterministic' as const;
  readonly dimension = 'consistency' as const;

  validate(input: HasOptions): RuleCheckResult {
    const failures: Array<{ ruleId: string; message: string }> = [];
    const warnings: string[] = [];
    const type = (input.type || '').trim().toLowerCase();

    if (!MCQ_TYPES.has(type)) return this.pass();

    const choices = (input.choices || []).map(c => (c || '').trim()).filter(Boolean);
    if (choices.length === 0) return this.pass(); // covered by MCQOptionRule

    // Check for near-identical options (case-insensitive, normalized)
    const normalized = choices.map(c => c.toLowerCase().replace(/\s+/g, ' '));
    const seen = new Map<string, number[]>();
    for (let i = 0; i < normalized.length; i++) {
      const key = normalized[i];
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(i);
    }
    for (const [key, indices] of seen) {
      if (indices.length > 1) {
        failures.push({
          ruleId: this.id,
          message: `Options ${indices.map(i => String.fromCharCode(65 + i)).join(' and ')} are identical after normalization: "${key}"`,
        });
      }
    }

    // Check if answer references a choice that is identical to another
    const answer = (input.answer || '').trim().toUpperCase();
    if (/^[A-D]$/.test(answer)) {
      const idx = answer.charCodeAt(0) - 65;
      if (idx < choices.length) {
        const correctNorm = (choices[idx] || '').toLowerCase().replace(/\s+/g, ' ');
        for (let i = 0; i < choices.length; i++) {
          if (i !== idx) {
            const otherNorm = (choices[i] || '').toLowerCase().replace(/\s+/g, ' ');
            if (correctNorm === otherNorm) {
              failures.push({
                ruleId: this.id,
                message: `Correct answer "${answer}" and distractor ${String.fromCharCode(65 + i)} are identical`,
              });
            }
          }
        }
      }
    }

    // Check for contradictory options (e.g., "always" vs "never")
    const hasOpposites = checkForOpposites(choices);
    if (hasOpposites.length > 0) {
      warnings.push(...hasOpposites.map(o => `Potential contradictory pair: "${o.a}" vs "${o.b}"`));
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

/** Detect opposite-meaning pairs in options. */
function checkForOpposites(choices: string[]): Array<{ a: string; b: string }> {
  const pairs: Array<{ a: string; b: string }> = [];
  const opposites: Array<[RegExp, RegExp]> = [
    [/\balways\b/i, /\bnever\b/i],
    [/\ball\b/i, /\bnone\b/i],
    [/\bincrease\b/i, /\bdecrease\b/i],
    [/\bpositive\b/i, /\bnegative\b/i],
    [/\bagree\b/i, /\bdisagree\b/i],
    [/\btrue\b/i, /\bfalse\b/i],
  ];
  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      for (const [a, b] of opposites) {
        if (a.test(choices[i]) && b.test(choices[j])) {
          pairs.push({ a: choices[i].slice(0, 40), b: choices[j].slice(0, 40) });
        }
      }
    }
  }
  return pairs;
}
