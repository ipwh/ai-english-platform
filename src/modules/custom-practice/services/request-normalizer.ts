// ============================================
// Self-Directed Practice — request normalization (2026-10-10, Sprint 140)
// ============================================
// Phase 1 + Phase 2 step 1–3: turn a free-form student request into a VALIDATED
// typed specification. Pure function — no IO, no AI, fully unit-testable.
//
// Ambiguity policy (mandate): never silently generate something unrelated to the
// student's intent. When the request does not state a category we infer it from
// explicit keyword evidence and DISCLOSE the inference in `interpretation`; when
// evidence is absent or contradictory we refuse and ask for clarification.
// ============================================

import {
  CUSTOM_PRACTICE_CATEGORIES,
  CUSTOM_PRACTICE_DIFFICULTIES,
  CUSTOM_PRACTICE_QUESTION_TYPES,
} from '@/modules/ai';
import type {
  PracticeCategory,
  PracticeDifficulty,
  PracticeQuestionType,
  PracticeSpec,
} from '../domain/types';

export const MIN_REQUEST_CHARS = 3;
export const MAX_REQUEST_CHARS = 400;
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 10;
export const DEFAULT_QUESTIONS = 5;

export const DEFAULT_EXERCISE_TYPES: Record<PracticeCategory, readonly PracticeQuestionType[]> = {
  grammar: ['mc', 'fill_blank', 'error_correction', 'transformation'],
  sentence_pattern: ['mc', 'fill_blank', 'transformation', 'sentence_production'],
  vocabulary: ['mc', 'fill_blank', 'sentence_production'],
};

/** Keyword evidence per category. Order-independent; a tie is treated as ambiguous. */
const CATEGORY_KEYWORDS: Record<PracticeCategory, readonly string[]> = {
  grammar: [
    'grammar', 'tense', 'tenses', 'present tense', 'past tense', 'past simple', 'past perfect',
    'present perfect', 'future', 'continuous', 'progressive', 'participle', 'article', 'articles',
    'preposition', 'prepositions', 'subject-verb', 'agreement', 'gerund', 'infinitive', 'passive',
    'active voice', 'modal', 'pronoun', 'plural', 'countable', 'uncountable', 'punctuation',
  ],
  sentence_pattern: [
    'sentence pattern', 'pattern', 'conditional', 'conditionals', 'zero conditional',
    'first conditional', 'second conditional', 'third conditional', 'if clause', 'inversion',
    'relative clause', 'clause', 'conjunction', 'connective', 'cause and effect', 'comparative',
    'superlative', 'reported speech', 'indirect speech',
  ],
  vocabulary: [
    'vocabulary', 'word', 'words', 'enough', 'too', 'too much', 'too many', 'collocation',
    'collocations', 'phrasal verb', 'phrasal verbs', 'expression', 'expressions', 'phrase',
    'synonym', 'antonym', 'meaning', 'usage', 'use of', 'idiom',
  ],
};

export interface NormalizeRequestInput {
  requestText?: unknown;
  category?: unknown;
  difficulty?: unknown;
  questionCount?: unknown;
  exerciseTypes?: unknown;
}

export type NormalizeRequestResult =
  | { ok: true; spec: PracticeSpec }
  | { ok: false; code: 'INVALID_REQUEST' | 'CATEGORY_AMBIGUOUS'; message: string };

/** Normalize the raw request WITHOUT deciding validity (used for inference). */
export function normalizeRequestText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // strip control characters
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferCategory(text: string): { category: PracticeCategory | null; ambiguous: boolean } {
  const haystack = ` ${text.toLowerCase()} `;
  const hits = CUSTOM_PRACTICE_CATEGORIES.filter(category =>
    CATEGORY_KEYWORDS[category].some(keyword => haystack.includes(` ${keyword} `) || haystack.includes(`${keyword},`) || haystack.includes(`${keyword}.`) || haystack.endsWith(` ${keyword}`))
  );

  if (hits.length === 1) return { category: hits[0], ambiguous: false };
  return { category: null, ambiguous: hits.length > 1 };
}

function isCategory(value: unknown): value is PracticeCategory {
  return typeof value === 'string' && (CUSTOM_PRACTICE_CATEGORIES as readonly string[]).includes(value);
}

function isDifficulty(value: unknown): value is PracticeDifficulty {
  return typeof value === 'string' && (CUSTOM_PRACTICE_DIFFICULTIES as readonly string[]).includes(value);
}

function isQuestionType(value: unknown): value is PracticeQuestionType {
  return typeof value === 'string' && (CUSTOM_PRACTICE_QUESTION_TYPES as readonly string[]).includes(value);
}

export function normalizePracticeRequest(input: NormalizeRequestInput): NormalizeRequestResult {
  const requestText = normalizeRequestText(input.requestText);
  if (requestText.length < MIN_REQUEST_CHARS || requestText.length > MAX_REQUEST_CHARS) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: `requestText must be between ${MIN_REQUEST_CHARS} and ${MAX_REQUEST_CHARS} characters`,
    };
  }

  let category: PracticeCategory;
  let interpretation: string | null = null;

  if (isCategory(input.category)) {
    category = input.category;
  } else {
    if (input.category !== undefined && input.category !== null && input.category !== '') {
      return { ok: false, code: 'INVALID_REQUEST', message: 'category must be grammar, sentence_pattern or vocabulary' };
    }
    const inferred = inferCategory(requestText);
    if (!inferred.category) {
      return {
        ok: false,
        code: 'CATEGORY_AMBIGUOUS',
        message: inferred.ambiguous
          ? 'The request matches more than one practice category. Please choose grammar, sentence_pattern or vocabulary.'
          : 'The request does not indicate a practice category. Please choose grammar, sentence_pattern or vocabulary (for example: "past perfect vs past simple").',
      };
    }
    category = inferred.category;
    interpretation = `Interpreted as ${category} practice based on the wording of the request.`;
  }

  const difficulty: PracticeDifficulty = isDifficulty(input.difficulty) ? input.difficulty : 'intermediate';
  if (input.difficulty !== undefined && input.difficulty !== null && !isDifficulty(input.difficulty)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'difficulty must be basic, intermediate or advanced' };
  }

  let questionCount = DEFAULT_QUESTIONS;
  if (input.questionCount !== undefined && input.questionCount !== null) {
    if (typeof input.questionCount !== 'number' || !Number.isInteger(input.questionCount)) {
      return { ok: false, code: 'INVALID_REQUEST', message: 'questionCount must be an integer' };
    }
    if (input.questionCount < MIN_QUESTIONS || input.questionCount > MAX_QUESTIONS) {
      return {
        ok: false,
        code: 'INVALID_REQUEST',
        message: `questionCount must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`,
      };
    }
    questionCount = input.questionCount;
  }

  let exerciseTypes: PracticeQuestionType[];
  if (input.exerciseTypes === undefined || input.exerciseTypes === null) {
    exerciseTypes = [...DEFAULT_EXERCISE_TYPES[category]];
  } else {
    if (!Array.isArray(input.exerciseTypes) || input.exerciseTypes.length === 0) {
      return { ok: false, code: 'INVALID_REQUEST', message: 'exerciseTypes must be a non-empty array' };
    }
    const invalid = input.exerciseTypes.filter(value => !isQuestionType(value));
    if (invalid.length > 0) {
      return {
        ok: false,
        code: 'INVALID_REQUEST',
        message: `exerciseTypes contains unsupported values: ${invalid.map(String).join(', ')}`,
      };
    }
    exerciseTypes = Array.from(new Set(input.exerciseTypes as PracticeQuestionType[]));
  }

  return {
    ok: true,
    spec: {
      requestText,
      objective: buildObjective(requestText, category),
      category,
      difficulty,
      questionCount,
      exerciseTypes,
      interpretation,
    },
  };
}

/**
 * The normalized objective is DERIVED, never invented: it is the student's own
 * wording (normalized, length-capped) tagged with the resolved category, so a
 * reviewer can always see what was actually asked for.
 */
export function buildObjective(requestText: string, category: PracticeCategory): string {
  const trimmed = requestText.length > 160 ? `${requestText.slice(0, 157)}...` : requestText;
  return `[${category}] ${trimmed}`;
}
