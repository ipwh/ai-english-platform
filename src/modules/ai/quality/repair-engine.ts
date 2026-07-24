// ============================================
// Sprint 101: Repair Engine
// Safe, deterministic repairs for common AI output defects.
// Does NOT regenerate content. Only applies structural fixes.
// ============================================

import type { RuleFailure, RepairResult, QualityContext } from './quality-types';
import { logger } from '@/shared/logger/logger';
import { stripMcqPrefix as _stripMcqPrefix } from '@/modules/ai/services/question-validator';

// ═══ Shared helpers ═══

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function isNonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ═══ Individual Repair Functions ═══

/**
 * Repair: missing or empty answer field.
 * Strategy: set to placeholder so downstream code doesn't crash.
 */
export function repairMissingAnswer<T extends Record<string, unknown>>(
  input: T,
  _failure: RuleFailure,
  _context?: QualityContext,
): RepairResult<T> {
  if (!input.answer || !isNonEmpty(input.answer as string)) {
    const repaired = clone(input);
    (repaired as Record<string, unknown>).answer = '[Answer missing — please regenerate]';
    logger.warn({ module: 'repair-engine', repair: 'missing-answer' }, 'Repaired missing answer');
    return { repaired: true, output: repaired, changes: ['Set placeholder for missing answer'] };
  }
  return { repaired: false, output: input, changes: [] };
}

/**
 * Repair: missing or empty explanation fields.
 * Strategy: copy from available explanation or set placeholder.
 */
export function repairMissingExplanation<T extends Record<string, unknown>>(
  input: T,
  _failure: RuleFailure,
  _context?: QualityContext,
): RepairResult<T> {
  const repaired = clone(input);
  let changed = false;
  const changes: string[] = [];

  if (!isNonEmpty(repaired.explanationZh as string)) {
    if (isNonEmpty(repaired.explanationEn as string)) {
      (repaired as Record<string, unknown>).explanationZh = repaired.explanationEn;
      changes.push('Copied explanationEn → explanationZh');
    } else {
      (repaired as Record<string, unknown>).explanationZh = '[Explanation missing]';
      changes.push('Set placeholder for missing explanationZh');
    }
    changed = true;
  }

  if (!isNonEmpty(repaired.explanationEn as string)) {
    if (isNonEmpty(repaired.explanationZh as string)) {
      (repaired as Record<string, unknown>).explanationEn = repaired.explanationZh;
      changes.push('Copied explanationZh → explanationEn');
    } else {
      (repaired as Record<string, unknown>).explanationEn = '[Explanation missing]';
      changes.push('Set placeholder for missing explanationEn');
    }
    changed = true;
  }

  if (changed) {
    logger.warn({ module: 'repair-engine', repair: 'missing-explanation' }, 'Repaired missing explanation');
  }
  return { repaired: changed, output: repaired, changes };
}

/**
 * Repair: duplicate choices in MCQ options.
 * Strategy: deduplicate and pad with fallback if needed.
 */
export function repairDuplicateOptions<T extends Record<string, unknown>>(
  input: T,
  _failure: RuleFailure,
  _context?: QualityContext,
): RepairResult<T> {
  const choices = input.choices as string[] | undefined;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { repaired: false, output: input, changes: [] };
  }

  const unique = [...new Set(choices.map(c => String(c).trim()).filter(Boolean))];
  if (unique.length === choices.length) {
    return { repaired: false, output: input, changes: [] };
  }

  const repaired = clone(input);
  (repaired as Record<string, unknown>).choices = unique;
  logger.warn({ module: 'repair-engine', repair: 'duplicate-options', removed: choices.length - unique.length }, 'Repaired duplicate options');
  return { repaired: true, output: repaired, changes: [`Removed ${choices.length - unique.length} duplicate options`] };
}

/**
 * Repair: MCQ answer is not a valid letter (A-D).
 * Strategy: attempt to match answer text to choice index.
 */
export function repairMcqAnswerLetter<T extends Record<string, unknown>>(
  input: T,
  _failure: RuleFailure,
  _context?: QualityContext,
): RepairResult<T> {
  const answer = (input.answer as string || '').trim();
  const choices = input.choices as string[] | undefined;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { repaired: false, output: input, changes: [] };
  }
  if (/^[A-D]$/i.test(answer)) {
    return { repaired: false, output: input, changes: [] }; // already valid
  }

  // Try matching answer text to a choice
  const normAnswer = answer.toLowerCase().replace(/^[a-d][.)]\s*/i, '');
  const matchIndex = choices.findIndex(
    c => {
      const stripped = _stripMcqPrefix(String(c)).toLowerCase().trim();
      return stripped === normAnswer || stripped.includes(normAnswer) || normAnswer.includes(stripped);
    },
  );

  if (matchIndex >= 0 && matchIndex < 4) {
    const letter = String.fromCharCode(65 + matchIndex);
    const repaired = clone(input);
    (repaired as Record<string, unknown>).answer = letter;
    logger.warn({ module: 'repair-engine', repair: 'mcq-answer-letter', from: answer, to: letter }, 'Repaired MCQ answer letter');
    return { repaired: true, output: repaired, changes: [`Converted answer "${answer}" → "${letter}"`] };
  }

  return { repaired: false, output: input, changes: [] };
}

/**
 * Repair: whitespace cleanup on all string fields.
 */
export function repairWhitespace<T extends Record<string, unknown>>(
  input: T,
  _failure: RuleFailure,
  _context?: QualityContext,
): RepairResult<T> {
  const repaired = clone(input);
  let changed = false;
  const changes: string[] = [];

  for (const [key, value] of Object.entries(repaired)) {
    if (typeof value === 'string') {
      const cleaned = normalizeWhitespace(value);
      if (cleaned !== value) {
        (repaired as Record<string, unknown>)[key] = cleaned;
        changed = true;
        changes.push(`Cleaned whitespace in "${key}"`);
      }
    }
  }

  if (changed) {
    logger.info({ module: 'repair-engine', repair: 'whitespace' }, 'Cleaned whitespace');
  }
  return { repaired: changed, output: repaired, changes };
}

/**
 * Repair: normalize choice options (strip prefixes, trim).
 */
export function repairChoiceNormalization<T extends Record<string, unknown>>(
  input: T,
  _failure: RuleFailure,
  _context?: QualityContext,
): RepairResult<T> {
  const choices = input.choices as string[] | undefined;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { repaired: false, output: input, changes: [] };
  }

  const normalized = choices.map(c => _stripMcqPrefix(String(c)).trim()).filter(Boolean);
  if (normalized.every((c, i) => c === choices[i])) {
    return { repaired: false, output: input, changes: [] };
  }

  const repaired = clone(input);
  (repaired as Record<string, unknown>).choices = normalized;
  logger.info({ module: 'repair-engine', repair: 'choice-normalization', changes: choices.length }, 'Normalized choice options');
  return { repaired: true, output: repaired, changes: [`Normalized ${choices.length} choices`] };
}

// ═══ Aggregate Repair ═══

/**
 * Apply all safe repairs to a validated AI output.
 * Repairs are deterministic and idempotent.
 */
export function applyAllRepairs<T extends Record<string, unknown>>(
  input: T,
  failures: RuleFailure[],
  _context?: QualityContext,
): { output: T; changes: string[] } {
  let current = input;
  const allChanges: string[] = [];

  // Apply repairs in order: whitespace first, then structural
  const repairs = [
    { name: 'whitespace', fn: repairWhitespace },
    { name: 'duplicate-options', fn: repairDuplicateOptions },
    { name: 'choice-normalization', fn: repairChoiceNormalization },
    { name: 'mcq-answer-letter', fn: repairMcqAnswerLetter },
    { name: 'missing-explanation', fn: repairMissingExplanation },
    { name: 'missing-answer', fn: repairMissingAnswer },
  ];

  for (const { name, fn } of repairs) {
    const isRelevant = failures.some(f => f.ruleId.includes(name) || f.message.toLowerCase().includes(name.replace('-', ' ')));
    if (isRelevant && failures.length > 0) {
      const result = fn(current as Parameters<typeof fn>[0], failures[0], _context);
      if (result.repaired) {
        current = result.output as unknown as T;
        allChanges.push(...result.changes);
      }
    }
  }

  return { output: current, changes: allChanges };
}
