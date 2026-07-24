// ============================================
// Sprint 102: QuestionStructureRule
// Validates that question has required structural fields:
// prompt/question text exists, type is valid.
// Repairs whitespace and normalizes fields.
// ============================================

import { BaseQualityRule } from '../quality-rule';
import type { RuleCheckResult } from '../quality-types';

interface HasQuestionStructure {
  prompt?: string;
  question?: string;
  questionText?: string;
  type?: string;
  difficulty?: string;
  gradeLevel?: string;
}

const VALID_TYPES = new Set([
  'mc', 'mcq', 'fill-blank', 'error-correction', 'short-writing',
  'short-answer', 'shortAnswer', 'matching', 'trueFalseNG',
  'referencing', 'inference', 'toneAttitude', 'sequencing',
  'synonymSearch', 'phraseSearch', 'negativeInference',
  'tableCompletion', 'causeEffectCompletion', 'exampleFinding',
  'authorIntention', 'vocabularyInContext', 'summaryCloze', 'mcCloze',
]);

export class QuestionStructureRule extends BaseQualityRule<HasQuestionStructure> {
  readonly id = 'question:structure';
  readonly name = 'Question Structure Check';
  readonly description = 'Ensures question has prompt text and valid type';
  readonly priority = 'critical' as const;
  readonly supportedTypes = ['GeneratedQuestion', 'GeneratedQuestion[]'];

  validate(input: HasQuestionStructure): RuleCheckResult {
    const warnings: string[] = [];
    const failures: Array<{ ruleId: string; message: string }> = [];

    // Check for prompt text (supports multiple field names)
    const prompt = input.prompt || input.question || input.questionText || '';
    if (!prompt || prompt.trim().length === 0) {
      failures.push({ ruleId: this.id, message: 'Question has no prompt/question text' });
    }
    if (prompt.trim().length === 1) {
      failures.push({ ruleId: this.id, message: 'Question prompt is only 1 character — likely invalid' });
    }

    // Check type field
    if (!input.type || input.type.trim().length === 0) {
      failures.push({ ruleId: this.id, message: 'Question type is missing or empty' });
    } else if (!VALID_TYPES.has(input.type.trim())) {
      warnings.push(`Question type "${input.type}" is not in the known valid types list`);
    }

    if (failures.length > 0) {
      return { passed: false, failures, warnings };
    }
    if (warnings.length > 0) {
      return { passed: true, failures: [], warnings };
    }
    return this.pass();
  }

  repair(input: HasQuestionStructure): { repaired: boolean; output: HasQuestionStructure; changes: string[] } {
    const repaired = { ...input };
    const changes: string[] = [];
    let changed = false;

    // Trim whitespace on all string fields
    for (const key of ['prompt', 'question', 'questionText', 'type', 'difficulty', 'gradeLevel'] as const) {
      const val = repaired[key];
      if (typeof val === 'string' && val !== val.trim()) {
        (repaired as Record<string, unknown>)[key] = val.trim();
        changes.push(`Trimmed whitespace on "${key}"`);
        changed = true;
      }
    }

    // Normalize type field (lowercase common variants)
    if (typeof repaired.type === 'string') {
      const norm = repaired.type.trim().toLowerCase();
      const aliases: Record<string, string> = {
        'multiple choice': 'mc',
        'multiple-choice': 'mc',
        'fill in the blank': 'fill-blank',
        'fill-in-the-blank': 'fill-blank',
        'fill_blank': 'fill-blank',
        'short answer': 'shortAnswer',
        'short_answer': 'shortAnswer',
        'true/false': 'trueFalseNG',
        'true false': 'trueFalseNG',
        't/f': 'trueFalseNG',
        'tfng': 'trueFalseNG',
        'error correction': 'error-correction',
        'short writing': 'short-writing',
      };
      if (aliases[norm] && aliases[norm] !== repaired.type) {
        (repaired as Record<string, unknown>).type = aliases[norm];
        changes.push(`Normalized type "${repaired.type}" → "${aliases[norm]}"`);
        changed = true;
      }
    }

    return { repaired: changed, output: repaired, changes };
  }
}
