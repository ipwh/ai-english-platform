// ============================================
// IELTS Objective Item Scorer — DETERMINISTIC, SERVER-ONLY
// ============================================
// `scoreIeltsItem()` is a pure function. The AI never decides whether an
// objective answer is correct (docs/ielts/IELTS_SCORING.md §6); it may only
// explain the canonical key. Client-submitted correctness claims are ignored
// by the service layer.
//
// Official semantics implemented:
//   * over-limit answers lose the mark (scored incorrect, WORD_LIMIT_EXCEEDED)
//   * hyphenated words count as single words (word-count policy)
//   * numbers may be figures or words when allowed (number equivalence)
//   * T/F/NG, Y/N/NG use canonical tokens
//   * MC uses letters; full option text accepted only on an unambiguous match
// ============================================

import {
  IELTS_SERVER_SCORING_METHOD,
  isIeltsMcType,
  isIeltsMatchingType,
  isIeltsObjectiveType,
  isIeltsWordLimitedType,
  type IeltsAnswerKey,
  type IeltsItemScore,
  type IeltsQuestionDefinition,
  type IeltsQuestionType,
} from '../domain/types';
import {
  completionCompareKey,
  normalizeIeltsAnswer,
  normalizeOptionCode,
  normalizeTrueFalseNotGiven,
  normalizeYesNoNotGiven,
  stripOptionPrefix,
} from '../domain/normalization';
import { validateWordLimit } from '../domain/word-count';

function incorrect(reason: IeltsItemScore['reason'], extra?: Partial<IeltsItemScore>): IeltsItemScore {
  return {
    verdict: 'incorrect',
    awardedScore: 0,
    maxScore: 1,
    countsTowardScore: true,
    scoredBy: IELTS_SERVER_SCORING_METHOD,
    reason,
    ...extra,
  };
}

function correct(reason: IeltsItemScore['reason'], extra?: Partial<IeltsItemScore>): IeltsItemScore {
  return {
    verdict: 'correct',
    awardedScore: 1,
    maxScore: 1,
    countsTowardScore: true,
    scoredBy: IELTS_SERVER_SCORING_METHOD,
    reason,
    ...extra,
  };
}

export interface IeltsScorableItem {
  questionType: IeltsQuestionType;
  options?: Array<string | { code: string; text: string }> | null;
  answerKey?: IeltsAnswerKey | null;
  answerMode?: 'single' | 'multiple-order-insensitive' | 'multiple-order-sensitive';
  acceptedAnswers?: string[] | null;
  wordLimit?: { maxWords?: number; allowsNumber?: boolean } | null;
}

/** Extract option code/text pairs from the flexible options representation. */
export function extractOptionPairs(
  options: IeltsScorableItem['options'],
): Array<{ code: string; text: string }> {
  if (!options || options.length === 0) return [];
  const pairs: Array<{ code: string; text: string }> = [];
  for (let i = 0; i < options.length; i++) {
    const raw = options[i];
    if (typeof raw === 'string') {
      pairs.push({ code: String.fromCharCode(65 + i), text: raw });
    } else {
      pairs.push({ code: raw.code, text: raw.text });
    }
  }
  return pairs;
}

function answerKeyToArray(key: IeltsAnswerKey | null | undefined): string[] {
  if (key === null || key === undefined) return [];
  return Array.isArray(key) ? key.map(String) : [String(key)];
}

/**
 * Deterministic scoring for one objective item.
 * Returns `ungradable` only for open-ended (writing/speaking) task types.
 */
export function scoreIeltsItem(
  studentAnswer: string,
  question: IeltsScorableItem,
): IeltsItemScore {
  const type = question.questionType;

  if (!isIeltsObjectiveType(type)) {
    return {
      verdict: 'ungradable',
      awardedScore: 0,
      maxScore: 1,
      countsTowardScore: false,
      scoredBy: IELTS_SERVER_SCORING_METHOD,
      reason: 'OPEN_ENDED_NOT_DETERMINISTIC',
    };
  }

  const answer = typeof studentAnswer === 'string' ? studentAnswer : '';
  if (answer.trim().length === 0) {
    return incorrect('EMPTY_ANSWER');
  }

  // 1. Word-limit gate (completion / short-answer families).
  if (isIeltsWordLimitedType(type)) {
    const limit = validateWordLimit(answer, question.wordLimit ?? undefined);
    if (limit.limitExceeded) {
      return incorrect('WORD_LIMIT_EXCEEDED', { wordCount: limit.wordCount, limitExceeded: true });
    }
    if (limit.numberNotAllowed) {
      return incorrect('NUMBER_NOT_ALLOWED', { wordCount: limit.wordCount, limitExceeded: false });
    }

    const keys = answerKeyToArray(question.answerKey);
    if (keys.length === 0) return incorrect('NO_MATCH');

    if (question.answerMode === 'multiple-order-insensitive' && keys.length > 1) {
      return scoreMultipleOrderInsensitive(answer, keys, question.acceptedAnswers ?? []);
    }

    return scoreTextAgainstKeys(answer, keys, question.acceptedAnswers ?? []);
  }

  // 2. True/False/Not Given.
  if (type === 'reading_true_false_not_given') {
    const student = normalizeTrueFalseNotGiven(answer);
    const keyValue = answerKeyToArray(question.answerKey)[0];
    const key = keyValue ? normalizeTrueFalseNotGiven(keyValue) : null;
    if (student && key && student === key) return correct('TRUEFALSE_CANONICAL');
    return incorrect('NO_MATCH');
  }

  // 3. Yes/No/Not Given.
  if (type === 'reading_yes_no_not_given') {
    const student = normalizeYesNoNotGiven(answer);
    const keyValue = answerKeyToArray(question.answerKey)[0];
    const key = keyValue ? normalizeYesNoNotGiven(keyValue) : null;
    if (student && key && student === key) return correct('TRUEFALSE_CANONICAL');
    return incorrect('NO_MATCH');
  }

  // 4. Multiple choice (listening 3 options / reading 4 options).
  if (isIeltsMcType(type)) {
    return scoreCodeAnswer(answer, question, 'MC');
  }

  // 5. Matching families (answer is an option code — letter or roman numeral).
  if (isIeltsMatchingType(type)) {
    return scoreCodeAnswer(answer, question, 'MATCHING');
  }

  // 6. Plan/map/diagram labelling: option-list variant → codes; free-text variant → completion.
  if (type === 'listening_plan_map_diagram_labelling') {
    const pairs = extractOptionPairs(question.options);
    if (pairs.length > 0) return scoreCodeAnswer(answer, question, 'MATCHING');
    const keys = answerKeyToArray(question.answerKey);
    if (keys.length === 0) return incorrect('NO_MATCH');
    return scoreTextAgainstKeys(answer, keys, question.acceptedAnswers ?? []);
  }

  // 7. Defensive fallback — unknown objective type behaves like completion.
  const keys = answerKeyToArray(question.answerKey);
  if (keys.length === 0) return incorrect('NO_MATCH');
  return scoreTextAgainstKeys(answer, keys, question.acceptedAnswers ?? []);
}

/** Convenience wrapper taking a full question definition. */
export function scoreIeltsItemDefinition(
  studentAnswer: string,
  question: IeltsQuestionDefinition,
): IeltsItemScore {
  return scoreIeltsItem(studentAnswer, {
    questionType: question.questionType,
    options: question.options ?? null,
    answerKey: question.answerKey ?? null,
    answerMode: question.answerMode,
    acceptedAnswers: question.acceptedAnswers ?? null,
    wordLimit: question.wordLimit ?? null,
  });
}

// ============================================
// Internals
// ============================================

function scoreTextAgainstKeys(
  answer: string,
  keys: string[],
  acceptedAnswers: string[],
): IeltsItemScore {
  const plain = normalizeIeltsAnswer(answer);
  const numeric = completionCompareKey(answer);

  for (let i = 0; i < keys.length; i++) {
    const candidate = keys[i];
    const candidatePlain = normalizeIeltsAnswer(candidate);
    if (plain === candidatePlain) {
      return correct(i === 0 ? 'EXACT_MATCH' : 'ACCEPTED_VARIANT');
    }
  }
  for (let i = 0; i < keys.length; i++) {
    const candidate = keys[i];
    if (numeric === completionCompareKey(candidate)) {
      return correct(i === 0 ? 'NUMBER_EQUIVALENT' : 'ACCEPTED_VARIANT');
    }
  }
  for (let i = 0; i < acceptedAnswers.length; i++) {
    const candidate = acceptedAnswers[i];
    if (plain === normalizeIeltsAnswer(candidate)) return correct('ACCEPTED_VARIANT');
  }
  for (let i = 0; i < acceptedAnswers.length; i++) {
    const candidate = acceptedAnswers[i];
    if (numeric === completionCompareKey(candidate)) return correct('NUMBER_EQUIVALENT');
  }
  return incorrect('NO_MATCH');
}

/**
 * Multiple-answer selection — DEFENSIVE PATH ONLY.
 * Official format numbers each answer separately ("Choose TWO letters" = TWO
 * questions, one mark each); the validator REJECTS multi-answer items so they
 * can never be published (COMPLETION_KEY_COUNT / MC_KEY_COUNT / MATCHING_KEY_COUNT).
 * Should an un-migrated row still reach scoring, it is graded all-or-nothing
 * (fail-closed: never awards marks the response did not earn).
 */
function scoreMultipleOrderInsensitive(
  answer: string,
  keys: string[],
  acceptedAnswers: string[],
): IeltsItemScore {
  const allCandidates = [...keys, ...acceptedAnswers];
  const studentTokens = splitMultiAnswer(answer);
  if (studentTokens.length !== keys.length) return incorrect('NO_MATCH');

  const used = new Array(allCandidates.length).fill(false);
  for (const token of studentTokens) {
    const tokenKey = completionCompareKey(token);
    let matched = -1;
    for (let i = 0; i < allCandidates.length; i++) {
      if (used[i]) continue;
      if (completionCompareKey(allCandidates[i]) === tokenKey) {
        matched = i;
        break;
      }
    }
    if (matched === -1) return incorrect('NO_MATCH');
    used[matched] = true;
  }
  return correct('EXACT_MATCH');
}

/** Split a multi-answer string on commas / "and" / semicolons. */
function splitMultiAnswer(answer: string): string[] {
  return answer
    .split(/,|;|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scoreCodeAnswer(
  answer: string,
  question: IeltsScorableItem,
  family: 'MC' | 'MATCHING',
): IeltsItemScore {
  const keys = answerKeyToArray(question.answerKey);
  if (keys.length === 0) return incorrect('NO_MATCH');

  const pairs = extractOptionPairs(question.options);
  const studentCode = normalizeOptionCode(stripOptionPrefix(answer));
  const studentRawCode = normalizeOptionCode(answer);

  for (const key of keys) {
    const keyCode = normalizeOptionCode(key);
    if (studentCode === keyCode || studentRawCode === keyCode) {
      return correct(family === 'MC' ? 'MC_LETTER_MATCH' : 'MATCHING_CODE_MATCH');
    }
  }

  if (pairs.length > 0) {
    // Full option text: accepted only when it uniquely matches ONE option.
    const studentText = normalizeIeltsAnswer(answer);
    const textMatches = pairs.filter((p) => normalizeIeltsAnswer(p.text) === studentText);
    if (textMatches.length === 1) {
      const matchedCode = normalizeOptionCode(textMatches[0].code);
      if (keys.some((k) => normalizeOptionCode(k) === matchedCode)) {
        return correct(family === 'MC' ? 'MC_OPTION_TEXT_MATCH' : 'MATCHING_CODE_MATCH');
      }
    }
  }

  return incorrect('NO_MATCH');
}
