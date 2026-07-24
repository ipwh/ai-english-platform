// ============================================
// Sprint 109: Prompt Validator & Optimizer
// ============================================

import type { PromptValidationResult, OptimizationResult, PromptConstraints } from './prompt-types';
import { DEFAULT_CONSTRAINTS } from './prompt-types';

const REQUIRED_PHRASES = [
  { phrase: 'answer', label: 'missing-answer-requirement' },
  { phrase: 'explanation', label: 'missing-explanation-requirement' },
  { phrase: 'JSON', label: 'missing-output-schema' },
  { phrase: 'option', label: 'missing-mcq-instruction' },
];

const CONFLICTING_PAIRS: Array<[RegExp, RegExp, string]> = [
  [/\bfree.?form\b/i, /\bstrict\b/i, 'Free-form and strict format conflict'],
  [/\ballow.*any\b/i, /\bexact\b/i, 'Allow-any and exact-match conflict'],
];

/** Validate a prompt before sending to LLM. */
export function validatePrompt(system: string, user: string): PromptValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const total = system + ' ' + user;
  const words = total.split(/\s+/).filter(Boolean);

  // Check required phrases
  for (const { phrase, label } of REQUIRED_PHRASES) {
    if (!total.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(`Missing required instruction: "${phrase}" (${label})`);
    }
  }

  // Check conflicting constraints
  for (const [a, b, msg] of CONFLICTING_PAIRS) {
    if (a.test(total) && b.test(total)) {
      warnings.push(msg);
    }
  }

  // Length checks
  if (words.length < 50) errors.push('Prompt is very short (<50 words) — may not provide enough guidance');
  if (words.length > 3000) warnings.push('Prompt is very long (>3000 words) — may exceed token limits');

  // Missing output schema
  if (!total.includes('JSON') && !total.includes('json')) {
    errors.push('Prompt does not specify JSON output format');
  }

  // Missing answer requirement
  if (!total.match(/answer|correct.*answer|expected.*answer/i)) {
    errors.push('Prompt does not require an answer field');
  }

  // Duplicate requirements
  const lines = total.split('\n').filter(l => l.trim());
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = line.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(normalized) && normalized.length > 10) {
      warnings.push(`Duplicate requirement detected: "${line.trim().slice(0, 60)}"`);
    }
    seen.add(normalized);
  }

  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);
  return { valid: errors.length === 0, errors, warnings, score };
}

/** Optimize a prompt by injecting missing constraints. */
export function optimizePrompt(system: string, customConstraints?: Partial<PromptConstraints>): OptimizationResult {
  const constraints = { ...DEFAULT_CONSTRAINTS, ...customConstraints };
  const added: string[] = [];

  let optimized = system;

  // Check which constraints are missing and add them
  if (constraints.alwaysIncludeAnswer && !system.match(/answer.*field|include.*answer|provide.*answer/i)) {
    optimized += '\n\n- EVERY question MUST include an answer field. Never omit the answer.';
    added.push('always-include-answer');
  }
  if (constraints.mcqExactFourOptions && !system.match(/exactly\s+4\s+options|four\s+options/i)) {
    optimized += '\n- MCQ questions MUST have exactly 4 options (A/B/C/D).';
    added.push('mcq-exact-four-options');
  }
  if (constraints.explanationRequired && !system.match(/explanation.*required|include.*explanation/i)) {
    optimized += '\n- Every question MUST include explanationZh and explanationEn fields.';
    added.push('explanation-required');
  }
  if (constraints.noPlaceholders && !system.match(/no\s+placeholder|do\s+not\s+use\s+placeholder/i)) {
    optimized += '\n- Do NOT use placeholder values like "N/A", "TBD", "...", or empty strings.';
    added.push('no-placeholders');
  }
  if (constraints.noTodo) {
    optimized += '\n- Do NOT output "TODO" or incomplete content.';
    added.push('no-todo');
  }
  if (constraints.avoidDuplicateOptions && !system.match(/unique\s+option|no\s+duplicate|distinct\s+option/i)) {
    optimized += '\n- All options must be unique. No duplicate option text.';
    added.push('avoid-duplicate-options');
  }
  if (constraints.readingAnswerableFromPassage && system.match(/reading/i) && !system.match(/answer.*passage|supported.*by.*passage/i)) {
    optimized += '\n- Reading questions: answer MUST be supported by the provided passage.';
    added.push('reading-answerable-from-passage');
  }
  if (constraints.listeningReferenceTranscript && system.match(/listen/i) && !system.match(/transcript|verbatim/i)) {
    optimized += '\n- Listening questions: answer MUST appear verbatim in the transcript.';
    added.push('listening-reference-transcript');
  }
  if (constraints.writingRequiresTask && system.match(/writ/i) && !system.match(/task|clear.*task/i)) {
    optimized += '\n- Writing prompts MUST specify a clear writing task.';
    added.push('writing-requires-task');
  }
  if (constraints.writingRequiresWordLimit && system.match(/writ/i) && !system.match(/word.*limit|word.*count|\d+\s*words/i)) {
    optimized += '\n- Writing prompts MUST include a suggested word count.';
    added.push('writing-requires-word-limit');
  }

  return { originalPrompt: system, optimizedPrompt: optimized, constraintsAdded: added, lengthChange: optimized.length - system.length };
}
