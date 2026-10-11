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
import {
  topicIdsFromRequest,
  topicQuestionTypeDefaults,
} from '@/shared/utils/custom-practice-topics';
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
    'grammar', 'tense', 'tenses', 'present tense', 'past tense', 'present simple', 'simple present',
    'past simple', 'simple past', 'past perfect',
    'present perfect', 'future tense', 'future simple', 'future continuous', 'future perfect',
    'continuous', 'progressive', 'participle', 'article', 'articles',
    'preposition', 'prepositions', 'subject-verb', 'agreement', 'gerund', 'infinitive', 'passive',
    'active voice', 'modal', 'pronoun', 'plural', 'countable', 'uncountable', 'punctuation',
    // 2026-10-10 (Sprint 146): the topic catalogue gained chips for these, and a ticked
    // topic must classify exactly like the same words typed by the student.
    // 'adjective' is deliberately ABSENT: it is part of the vocabulary request
    // "enough and too with adjectives" (regression-cased), so the chip relies on "adverb".
    'used to', 'quantifier', 'adverb', 'negation',
  ],
  sentence_pattern: [
    'sentence pattern', 'pattern', 'conditional', 'conditionals', 'zero conditional',
    'first conditional', 'second conditional', 'third conditional', 'if clause', 'inversion',
    'relative clause', 'clause', 'conjunction', 'connective', 'cause and effect', 'comparative',
    'superlative', 'reported speech', 'indirect speech', 'simile', 'as as',
    // 2026-10-10 (Sprint 146): clause / mood / emphasis chip coverage. Multi-word keys
    // ("question form", "indirect question") are used instead of a bare "question" so that
    // a politeness frame like "I have a question about vocabulary" is not read as a topic.
    'question form', 'indirect question', 'cleft', 'subjunctive', 'wish', 'parallel', 'emphasis',
    'discourse', 'causative',
  ],
  vocabulary: [
    'vocabulary', 'word', 'words', 'enough', 'too', 'too much', 'too many', 'collocation',
    'collocations', 'phrasal verb', 'phrasal verbs', 'expression', 'expressions', 'phrase',
    'synonym', 'antonym', 'meaning', 'usage', 'use of', 'idiom',
  ],
};

/**
 * Chinese topic words, matched as plain substrings (Chinese has no word
 * boundaries). The platform's own UI is bilingual, so a student who cannot spell
 * "conditional" must not be refused by 由系統判斷 — the terms below are the
 * everyday Chinese names of the same three categories.
 */
const CHINESE_CATEGORY_KEYWORDS: Record<PracticeCategory, readonly string[]> = {
  grammar: [
    '文法', '語法', '時態', '過去式', '現在式', '現在完成式', '過去完成式', '被動語態', '介詞', '冠詞',
    '代名詞', '情態動詞', '動名詞', '不定詞', '現在分詞', '單複數',
    // 2026-10-10 (Sprint 146). Bare '副詞' is deliberately absent: it would collide with
    // '副詞子句' (sentence_pattern) and turn a clear request into an ambiguity refusal.
    '否定句', '數量詞', '形容詞', '標點',
  ],
  sentence_pattern: [
    '句式', '句構', '句型', '條件句', '子句', '連接詞', '比較級', '最高級', '轉述', '倒裝句', '比喻',
    // 2026-10-10 (Sprint 146): clause / mood / emphasis chips. All are multi-character
    // terms that do not appear inside any grammar or vocabulary keyword above.
    '強調句', '假設語氣', '疑問句', '平行結構', '使役', '篇章標記',
  ],
  vocabulary: ['詞彙', '生字', '單字', '片語', '慣用語', '近義詞', '反義詞', '搭配詞', '字義'],
};

/**
 * WEAK grammar evidence: words that name a topic on their own ("should and
 * could", "the future" — the way students actually ask) but are ordinary
 * auxiliaries or generic time words in meta-phrasing ("I would like to practise
 * conditionals", "conditional sentences about the possible future"). They are
 * consulted ONLY when the request names no topic at all, so they can never turn a
 * clearly-identified request into a refusal. Without this fallback a plain
 * "should and could" matched nothing and the API answered 400 (2026-10-10 report).
 */
const WEAK_GRAMMAR_KEYWORDS: readonly string[] = [
  'should', 'could', 'would', 'shall', 'will', 'can', 'may', 'might', 'must',
  'ought', 'had better', 'used to', 'modals', 'modal verbs', 'future',
];

/** One keyword as a whole word, tolerating a plural/possessive final word. */
const keywordPatterns = new Map<string, RegExp>();

function keywordPattern(keyword: string): RegExp {
  const cached = keywordPatterns.get(keyword);
  if (cached) return cached;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "infinitive" must also match "infinitives": 6B Unit 15 is titled
  // "Infinitives with/without to", and a student who copies the unit title used to
  // be refused because the list only contained the singular form.
  const pattern = new RegExp(` ${escaped}(?:'s|s|es)? `);
  keywordPatterns.set(keyword, pattern);
  return pattern;
}

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

/**
 * Is this weak keyword being used AS the topic, or is it ordinary grammar inside a
 * meta/politeness frame?
 *
 * A student who lists modals ("should and could", "can vs must") or ends the request
 * with one ("if … will", "the future") is naming a topic. A student who writes
 * "I would like to practise spelling" or "Can I practise spelling?" has only used an
 * auxiliary, and that request still names no known topic — it must be clarified
 * rather than silently answered with grammar practice (found in the 2026-10-10
 * review; the weak fallback was firing on every politeness frame).
 */
function isTopicUse(haystack: string, keyword: string): boolean {
  const core = `${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s|s|es)?`;
  const atEnd = new RegExp(` ${core}(?: please)? $`);
  const connector = '(?:and|or|vs|versus)';
  const listed = new RegExp(`(?: ${connector} ${core} )|(?: ${core} ${connector} )`);
  return atEnd.test(haystack) || listed.test(haystack);
}

export function inferCategory(text: string): { category: PracticeCategory | null; ambiguous: boolean } {
  // Normalize to a token stream first: punctuation and the end of the string must
  // behave exactly like a separating space, otherwise "…past perfect." would not
  // match the "past perfect" keyword (found by the Sprint 141 route tests).
  const haystack = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
  const matches = (keywords: readonly string[]) => keywords.some(keyword => keywordPattern(keyword).test(haystack));
  const matchesChinese = (keywords: readonly string[]) => keywords.some(keyword => text.includes(keyword));

  const hits = CUSTOM_PRACTICE_CATEGORIES.filter(
    category => matches(CATEGORY_KEYWORDS[category]) || matchesChinese(CHINESE_CATEGORY_KEYWORDS[category])
  );

  if (hits.length === 1) return { category: hits[0], ambiguous: false };
  if (hits.length > 1) return { category: null, ambiguous: true };
  // No topic named: a modal verb (or "the future") still identifies grammar — but
  // only where the student used it as the topic (see `isTopicUse`).
  const weak = WEAK_GRAMMAR_KEYWORDS.some(
    keyword => matches([keyword]) && isTopicUse(haystack, keyword)
  );
  return { category: weak ? 'grammar' : null, ambiguous: false };
}

function isCategory(value: unknown): value is PracticeCategory {
  return typeof value === 'string' && (CUSTOM_PRACTICE_CATEGORIES as readonly string[]).includes(value);
}

function isDifficulty(value: unknown): value is PracticeDifficulty {
  return typeof value === 'string' && (CUSTOM_PRACTICE_DIFFICULTIES as readonly string[]).includes(value);
}

/**
 * The question types used when the student left 題型 blank.
 *
 * Topic-aware first: the catalogue knows that 分詞構句 is learned by rewriting and that
 * punctuation is learned by spotting the error, so a ticked topic picks its own mix. The
 * category default remains the fallback for a free-text request (or when the 400-character
 * cap cut the labels off), and an explicit student choice never reaches this function.
 */
function resolveDefaultExerciseTypes(category: PracticeCategory, requestText: string): PracticeQuestionType[] {
  const fromTopics = topicQuestionTypeDefaults(category, topicIdsFromRequest(category, requestText)).filter(
    isQuestionType
  );
  return fromTopics.length > 0 ? fromTopics : [...DEFAULT_EXERCISE_TYPES[category]];
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
    exerciseTypes = resolveDefaultExerciseTypes(category, requestText);
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
