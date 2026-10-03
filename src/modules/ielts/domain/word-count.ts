// ============================================
// IELTS Word Counting — deterministic, policy-tested
// ============================================
// Official rules reflected here (see docs/ielts/IELTS_SCORING.md §4):
//   * hyphenated words count as SINGLE words ("check-in" = 1)
//   * numbers count as one word (figures or words)
//   * contracted words are not tested in completion items; when counted they
//     count as one word
// This is NOT `text.split(' ').length` — Unicode whitespace, NBSP, dashes and
// abbreviations are handled explicitly and covered by tests.
// ============================================

/**
 * Word count policy for IELTS practice:
 * 1. Normalize Unicode whitespace (incl. NBSP, thin spaces) to spaces.
 * 2. Split on whitespace only. Do NOT split on internal hyphens, apostrophes,
 *    slashes, or abbreviation dots.
 * 3. Tokens that contain only punctuation (e.g. a lone "—" used as a dash)
 *    are not words.
 */
export function countIeltsWords(text: string | null | undefined): number {
  if (!text) return 0;
  const normalized = text
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Unicode spaces
    .replace(/[\r\n\t]+/g, ' ');
  const tokens = normalized.split(' ').filter((raw) => {
    const token = raw.trim();
    if (token.length === 0) return false;
    // A token that has no letter or digit is punctuation-only (—, …, *, etc.)
    return /[\p{L}\p{N}]/u.test(token);
  });
  return tokens.length;
}

export interface IeltsWordLimitResult {
  ok: boolean;
  wordCount: number;
  limitExceeded: boolean;
  /** True when a numeric-only answer is used but the rule forbids numbers. */
  numberNotAllowed: boolean;
}

/**
 * Validate an answer against a word-limit rule.
 * Official semantics: writing MORE than the limit loses the mark; hyphenated
 * words count as single words; numbers may be figures or words (when allowed).
 */
export function validateWordLimit(
  answer: string,
  limit: { maxWords?: number; allowsNumber?: boolean } | null | undefined,
): IeltsWordLimitResult {
  const wordCount = countIeltsWords(answer);
  if (!limit || typeof limit.maxWords !== 'number') {
    return { ok: true, wordCount, limitExceeded: false, numberNotAllowed: false };
  }
  const limitExceeded = wordCount > limit.maxWords;
  const trimmed = answer.trim();
  const numberOnly = /^[\p{N}][\p{N},.\s]*$/u.test(trimmed) && trimmed.length > 0;
  const numberNotAllowed = limit.allowsNumber === false && numberOnly;
  return {
    ok: !limitExceeded && !numberNotAllowed,
    wordCount,
    limitExceeded,
    numberNotAllowed,
  };
}

// ============================================
// Writing minimum-length policy
// ============================================

export const IELTS_MIN_WORDS_TASK1 = 150;
export const IELTS_MIN_WORDS_TASK2 = 250;

export interface IeltsLengthCheck {
  wordCount: number;
  minimum: number;
  belowMinimum: boolean;
  /**
   * Official position: a short answer "may not provide enough evidence of the
   * language features needed in order to award higher bands". The platform
   * surfaces this as a limitation — never as a mechanical band penalty claim.
   */
  officialNote: string;
}

export function checkWritingLength(
  text: string,
  taskType: 'academic_task1' | 'general_task1' | 'academic_task2' | 'general_task2',
): IeltsLengthCheck {
  const minimum = taskType.endsWith('task1') ? IELTS_MIN_WORDS_TASK1 : IELTS_MIN_WORDS_TASK2;
  const wordCount = countIeltsWords(text);
  return {
    wordCount,
    minimum,
    belowMinimum: wordCount < minimum,
    officialNote:
      wordCount < minimum
        ? `Below the ${minimum}-word minimum — the response may not provide enough evidence of the language features needed for higher bands.`
        : `At or above the ${minimum}-word minimum.`,
  };
}
