// ============================================
// AI Question Validator — MCQ normalization & answer consistency
// Extracted from ai-service.ts (Sprint 0.5)
// ============================================

import { logger } from '@/shared/logger/logger';

/** Local type mirror of GeneratedQuestion (avoids circular dependency with ai-service.ts) */
export interface ValidatableQuestion {
  type: string;
  prompt: string;
  promptZh?: string;
  choices?: string[];
  answer: string;
  explanationZh: string;
  explanationEn: string;
  commonMistake: string;
  grammarPoint?: string;
  listeningContent?: string;
  listeningContentZh?: string;
  readingContent?: string;
  readingContentZh?: string;
}

export const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function toMcqLetter(index: number): string | undefined {
  return MCQ_LETTERS[index];
}

export function stripMcqPrefix(choice: string): string {
  return choice
    .trim()
    // A. / (A) / A) / 1. / (1)
    .replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s*[\].:：)\-、]\s*/u, '')
    // A followed by space (looser, only for letter prefixes, NEVER number prefixes)
    .replace(/^\s*\(?\s*(?:[A-Da-d])\s*\)?\s+/u, '')
    // T: / F) / True: / False. — only when followed by punctuation
    .replace(/^\s*\(?\s*(?:T|F|True|False)\s*\)?\s*[\].:：)\-、]\s*/iu, '')
    .replace(/^\s*\(?\s*(?:T|F|True|False)\s*\)?\s+/iu, '')
    .trim();
}

export function normalizeMcqAnswer(answerRaw: string, normalizedChoices: string[]): string | null {
  const answer = answerRaw.trim();
  // R3.10-L: never default to a fabricated letter — an unresolvable answer
  // key means the question is defective and must be rejected, not delivered
  // with a guessed "correct" option.
  if (!answer) return null;

  const letterMatch = answer.match(/\b([A-D])\b/i);
  if (letterMatch) return letterMatch[1].toUpperCase();

  const numberMatch = answer.match(/\b([1-4])\b/);
  if (numberMatch) return MCQ_LETTERS[Number(numberMatch[1]) - 1];

  const normalizedAnswerText = stripMcqPrefix(answer).toLowerCase();
  const choiceIndex = normalizedChoices.findIndex(c => c.toLowerCase() === normalizedAnswerText);
  if (choiceIndex >= 0 && choiceIndex < MCQ_LETTERS.length) return MCQ_LETTERS[choiceIndex];

  const tfMatch = normalizedAnswerText.match(/^(true|false|t|f)$/i);
  if (tfMatch) {
    const target = tfMatch[1].toLowerCase().startsWith('t') ? 'true' : 'false';
    const tfChoiceIndex = normalizedChoices.findIndex(c => c.trim().toLowerCase().startsWith(target));
    if (tfChoiceIndex >= 0 && tfChoiceIndex < MCQ_LETTERS.length) return MCQ_LETTERS[tfChoiceIndex];
  }

  // Failed all matching attempts — the question is defective. Callers MUST
  // reject it; never default to 'A' (fabricated scoring authority).
  logger.warn({
    module: 'question-validator',
    answerRaw: answerRaw.slice(0, 80),
    choices: normalizedChoices.join('|').slice(0, 120),
  }, 'normalizeMcqAnswer: could not match answer to any choice — rejecting question');
  return null;
}

export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[.!?,;:]$/, '');
}

/**
 * Answer consistency auto-fix: validates MCQ answers against choices,
 * checks listening/reading content for answer presence, and detects
 * choice quality issues.
 *
 * v2.1: Listening exact-match failures downgraded to warnings
 * (synonyms/paraphrase may be used in natural dialogue).
 */
export function validateAndFixQuestion(
  q: ValidatableQuestion,
  index: number,
): { fixed: ValidatableQuestion; warnings: string[]; rejected: boolean } {
  const warnings: string[] = [];
  const fixed = { ...q };
  let rejected = false;

  // 1. MCQ: answer must point to a valid choice
  if (fixed.type === 'mc' && fixed.choices && fixed.choices.length > 0) {
    const answerRaw = (fixed.answer || '').trim();
    const answerLetter = answerRaw.toUpperCase();
    const letterIndex = MCQ_LETTERS.indexOf(answerLetter as typeof MCQ_LETTERS[number]);

    if (letterIndex >= 0 && letterIndex < fixed.choices.length) {
      // valid letter — answer points to an existing choice
    } else if (letterIndex >= 0 && letterIndex >= fixed.choices.length) {
      // ⚠️ Answer letter is out of range (e.g., "D" but only 3 choices A/B/C)
      // This is a data integrity issue — the answer references a non-existent choice.
      // Try to auto-fix by matching the answer text, otherwise reject.
      const normAnswer = normalizeAnswer(answerRaw);
      const matchIndex = fixed.choices.findIndex(
        c => normalizeAnswer(stripMcqPrefix(c)) === normAnswer,
      );
      if (matchIndex >= 0 && matchIndex < MCQ_LETTERS.length) {
        fixed.answer = MCQ_LETTERS[matchIndex];
        warnings.push(`Q${index}: answer letter "${answerLetter}" out of range (only ${fixed.choices.length} choices), auto-fixed to "${fixed.answer}" via text match`);
      } else {
        // Log as error (not just warning) — this question has broken data.
        // R3.10-L: NEVER silently rewrite the key to the first choice —
        // reject the question so it can be regenerated.
        logger.error({
          module: 'question-validator',
          questionIndex: index,
          answer: answerRaw,
          choicesCount: fixed.choices.length,
          choices: fixed.choices.map(c => c.slice(0, 40)).join('|'),
        }, `Q${index}: answer "${answerLetter}" out of range (${fixed.choices.length} choices), cannot fix — rejecting`);
        warnings.push(`Q${index}: CRITICAL — answer "${answerLetter}" references non-existent choice (only ${fixed.choices.length} choices available: ${MCQ_LETTERS.slice(0, fixed.choices.length).join('/')})`);
        rejected = true;
      }
    } else {
      const normAnswer = normalizeAnswer(answerRaw);
      const matchIndex = fixed.choices.findIndex(
        c => normalizeAnswer(stripMcqPrefix(c)) === normAnswer,
      );
      if (matchIndex >= 0 && matchIndex < MCQ_LETTERS.length) {
        fixed.answer = MCQ_LETTERS[matchIndex];
        warnings.push(`Q${index}: auto-fixed answer "${answerRaw}" → "${fixed.answer}"`);
      } else {
        // R3.10-L: an MC answer that resolves to no choice is defective —
        // reject rather than persist a key that can never be correct.
        warnings.push(`Q${index}: answer "${answerRaw}" does not match any choice — rejecting`);
        rejected = true;
      }
    }

    // Choice quality checks
    for (let ci = 0; ci < fixed.choices.length; ci++) {
      const choice = stripMcqPrefix(fixed.choices[ci] || '');
      if (/^[\d:.\s]{1,3}$/.test(choice) && !/^\d{1,2}:\d{2}/.test(choice)) {
        warnings.push(
          `Q${index}: choice ${MCQ_LETTERS[ci]} "${choice}" looks like a number fragment`,
        );
      }
      if (/all\s*of\s*the\s*above/i.test(choice)) {
        warnings.push(
          `Q${index}: choice ${MCQ_LETTERS[ci]} "All of the above" is not DSE-compatible`,
        );
      }
    }
  }

  // 2. Listening: answer text should appear in listeningContent
  if (fixed.listeningContent && fixed.answer) {
    const answerToCheck =
      fixed.choices && fixed.choices.length > 0
        ? (() => {
            const li = MCQ_LETTERS.indexOf(fixed.answer.trim().toUpperCase() as typeof MCQ_LETTERS[number]);
            return li >= 0 && li < fixed.choices.length ? fixed.choices[li] : fixed.answer;
          })()
        : fixed.answer;

    const normListening = normalizeAnswer(fixed.listeningContent);
    const normAnswer = normalizeAnswer(answerToCheck);

    if (!normListening.includes(normAnswer)) {
      const words = normAnswer.split(' ');
      const lastTwo = words.slice(-2).join(' ');
      const lastThree = words.slice(-3).join(' ');
      if (!normListening.includes(lastThree) && !normListening.includes(lastTwo)) {
        const warnMsg = `[Listening Consistency] Q${index}: answer "${answerToCheck}" not found verbatim in listeningContent — kept with warning (synonyms/paraphrase may be used)`;
        logger.warn({ module: 'question-validator' }, warnMsg);
        warnings.push(warnMsg);
      }
    }
  }

  // 3. Reading: keyword presence check
  if (fixed.readingContent && fixed.answer) {
    const answerToCheck =
      fixed.choices && fixed.choices.length > 0
        ? (() => {
            const li = MCQ_LETTERS.indexOf(fixed.answer.trim().toUpperCase() as typeof MCQ_LETTERS[number]);
            return li >= 0 && li < fixed.choices.length ? fixed.choices[li] : fixed.answer;
          })()
        : fixed.answer;

    const normReading = normalizeAnswer(fixed.readingContent);
    const normAnswer = normalizeAnswer(answerToCheck);
    const keyWords = normAnswer.split(' ').filter(w => w.length > 3);
    const missing = keyWords.filter(kw => !normReading.includes(kw));
    if (missing.length === keyWords.length && keyWords.length > 0) {
      logger.warn({
        module: 'question-validator',
        questionIndex: index,
        answer: answerToCheck,
      }, `no keywords from answer in readingContent`);
    }
  }

  return { fixed, warnings, rejected };
}
