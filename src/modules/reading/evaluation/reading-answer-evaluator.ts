// ============================================
// Phase 2A: Reading Answer Evaluator
// Pure functions for copy detection, paraphrase classification,
// grammar fit, and DSE item-type routing.
// No AI calls — local analysis only.
// ============================================

import type {
  CopyingLevel,
  ParaphraseQuality,
  GrammarFit,
  Completeness,
  ReadingAnswerEvaluation,
} from './reading-answer-types';
import { createEmptyEvaluation } from './reading-answer-types';

// ============================================
// DSE Item-Type Routing
// ============================================

/** DSE types safe for simple local objective checking */
export const OBJECTIVE_DSE_TYPES = new Set([
  'multiple_choice',
  'true_false_not_given',
]);

/** Whether a DSE type requires API-based semantic evaluation */
export function requiresApiEvaluation(dseType?: string): boolean {
  if (!dseType) return true; // Unknown types default to API evaluation
  if (OBJECTIVE_DSE_TYPES.has(dseType)) return false;
  return true;
}

// ============================================
// Text Normalization
// ============================================

/** Normalize text for comparison: lowercase, strip punctuation, collapse whitespace */
export function normalizeForComparison(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// Copying Detection
// ============================================

/**
 * Estimate the fraction of answer tokens found verbatim in source evidence.
 * Returns 0-1 where 1 = entire answer is a substring of the evidence.
 */
export function estimateCopyingRatio(answer: string, evidence: string): number {
  const a = normalizeForComparison(answer);
  const e = normalizeForComparison(evidence);

  if (!a || !e) return 0;

  // Exact substring match
  if (e.includes(a)) return 1;

  // Token-level overlap
  const answerTokens = a.split(' ');
  const evidenceTokens = new Set(e.split(' '));
  const overlap = answerTokens.filter(token => evidenceTokens.has(token)).length;

  return answerTokens.length > 0 ? overlap / answerTokens.length : 0;
}

/** Classify copying severity from ratio */
export function classifyCopyingLevel(ratio: number): CopyingLevel {
  if (ratio >= 0.85) return 'heavy';
  if (ratio >= 0.5) return 'light';
  return 'none';
}

// ============================================
// Paraphrase Quality
// ============================================

/**
 * Detect whether an answer shows lexical shifts (synonym substitution)
 * by checking if key content words differ from the source.
 */
export function detectLexicalShift(answer: string, evidence: string): boolean {
  const a = normalizeForComparison(answer);
  const e = normalizeForComparison(evidence);

  if (!a || !e) return false;

  const answerWords = new Set(a.split(' ').filter(w => w.length > 3));
  const evidenceWords = new Set(e.split(' ').filter(w => w.length > 3));

  // Count content words in answer NOT found in evidence
  let shifted = 0;
  let totalContent = 0;
  for (const word of answerWords) {
    totalContent++;
    if (!evidenceWords.has(word)) shifted++;
  }

  // Lexical shift if at least 30% of content words differ
  return totalContent > 0 && shifted / totalContent >= 0.3;
}

/**
 * Detect whether an answer shows structural shift (different word order,
 * clause structure) by comparing word sequence overlap.
 */
export function detectStructuralShift(answer: string, evidence: string): boolean {
  const a = normalizeForComparison(answer);
  const e = normalizeForComparison(evidence);

  if (!a || !e) return false;

  const answerTokens = a.split(' ');
  const evidenceTokens = e.split(' ');

  if (answerTokens.length < 3 || evidenceTokens.length < 3) return false;

  // Check for shared bigrams — if few shared bigrams, structure differs
  const evidenceBigrams = new Set<string>();
  for (let i = 0; i < evidenceTokens.length - 1; i++) {
    evidenceBigrams.add(`${evidenceTokens[i]} ${evidenceTokens[i + 1]}`);
  }

  let sharedBigrams = 0;
  let totalBigrams = 0;
  for (let i = 0; i < answerTokens.length - 1; i++) {
    totalBigrams++;
    if (evidenceBigrams.has(`${answerTokens[i]} ${answerTokens[i + 1]}`)) {
      sharedBigrams++;
    }
  }

  // Structural shift if less than 50% of bigrams are shared
  return totalBigrams > 0 && sharedBigrams / totalBigrams < 0.5;
}

/** Classify paraphrase quality from copying ratio + shift detection */
export function classifyParaphraseQuality(params: {
  copyingRatio: number;
  hasLexicalShift: boolean;
  hasStructuralShift: boolean;
}): ParaphraseQuality {
  const { copyingRatio, hasLexicalShift, hasStructuralShift } = params;

  if (copyingRatio >= 0.85) return 'none';
  if (copyingRatio >= 0.65) return hasStructuralShift ? 'limited' : 'none';
  if (hasLexicalShift && hasStructuralShift) return 'strong';
  if (hasLexicalShift || hasStructuralShift) return 'adequate';
  return 'limited';
}

// ============================================
// Grammar Fit Detection
// ============================================

/**
 * 2026-09-17 (fix D): how many blanks the item asks the student to fill.
 *
 * A summary-cloze item such as
 *   "Use ONE word for each blank. ... not by (i) ___ but by ... (ii) ___ ... (iii) ___"
 * has THREE blanks. Counting every word in the answer as if it belonged to a
 * single-word blank made a fully correct 3-word answer look like
 * "too many words for a single-word answer" (grammaticalFitToPrompt='poor').
 */
export function countBlanks(prompt: string, expectedAnswer?: string): number {
  const roman = prompt.match(/\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)/gi) ?? [];
  const numeric = prompt.match(/\(\d+\)/g) ?? [];
  const underscoreRuns = prompt.match(/_{2,}/g) ?? [];

  let blanks = Math.max(roman.length, numeric.length, underscoreRuns.length);

  // Multi-blank keys are persisted as one comma/semicolon-separated string
  // ("indifference, numbers, carrying") even when the prompt does not spell
  // out the (i)/(ii)/(iii) markers for every blank.
  if (blanks <= 1 && expectedAnswer) {
    const parts = expectedAnswer.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) blanks = parts.length;
  }

  return Math.max(1, blanks);
}

export interface GrammarFitOptions {
  /** Number of blanks the item asks the student to fill (default 1). */
  blankCount?: number;
  /** Explicit per-blank word cap taken from the question's word limit. */
  maxWordsPerBlank?: number;
}

/**
 * Estimate how well the answer fits grammatically into the question prompt.
 * Checks: word count adequacy, basic sentence structure, prompt expectations.
 */
export function detectGrammarFit(
  prompt: string,
  answer: string,
  options: GrammarFitOptions = {},
): GrammarFit {
  if (!answer.trim()) return 'poor';

  const expectsSentence =
    /complete the sentence|using your own words|state one reason|explain why|describe|summarize/i.test(prompt);

  const expectsSingleWord =
    /one word|find a word|single word/i.test(prompt);

  const expectsPhrase =
    /no more than three words|a word or phrase|a phrase/i.test(prompt);

  const blankCount = Math.max(1, Math.floor(options.blankCount ?? 1));
  const tokenCount = answer.trim().split(/\s+/).length;

  // Fix D: expectations are per blank, not per item. With blankCount=1 this
  // is identical to the previous behaviour.
  const perBlankTokens = blankCount > 1 ? tokenCount / blankCount : tokenCount;
  const cap = options.maxWordsPerBlank;

  // Explicit word limit (e.g. "no more than TWO words") wins when given.
  if (cap !== undefined && cap > 0) {
    if (perBlankTokens <= cap) return 'good';
    if (perBlankTokens <= cap + 1) return 'acceptable';
    return 'poor';
  }

  // Single-word expectations
  if (expectsSingleWord) {
    if (perBlankTokens === 1) return 'good';
    if (perBlankTokens <= 2) return 'acceptable';
    return 'poor'; // Too many words for a single-word answer
  }

  // Phrase expectations
  if (expectsPhrase) {
    if (perBlankTokens <= 3) return 'good';
    if (perBlankTokens <= 5) return 'acceptable';
    return 'poor';
  }

  // Sentence expectations
  if (expectsSentence) {
    if (perBlankTokens >= 5) return 'good';
    if (perBlankTokens >= 3) return 'acceptable';
    return 'poor';
  }

  // Default: reasonable length = acceptable
  if (perBlankTokens >= 3) return 'good';
  if (perBlankTokens >= 1) return 'acceptable';
  return 'poor';
}

/**
 * 2026-09-17 (fix C): whether the student's answer is the same as the
 * canonical key, ignoring case, punctuation and token order.
 *
 * Used to stop the copying heuristic from flagging an answer that simply IS
 * the extracted key (e.g. "carrying capacity", or a 3-blank key
 * "indifference, numbers, carrying") as "paraphrase too close".
 */
export function answersEquivalent(studentAnswer: string, expectedAnswer: string): boolean {
  const normalise = (s: string) =>
    normalizeForComparison(s).split(' ').filter(Boolean).sort().join(' ');

  const a = normalise(studentAnswer);
  const b = normalise(expectedAnswer);
  if (!a || !b) return false;
  return a === b;
}

// ============================================
// Completeness Assessment
// ============================================

/** Simple completeness check based on word count vs expected */
export function assessCompleteness(
  answer: string,
  expectedAnswer: string,
  maxWords?: number,
): Completeness {
  if (!answer.trim()) return 'partial';

  const answerLen = answer.trim().split(/\s+/).length;
  const expectedLen = expectedAnswer.trim().split(/\s+/).length;

  // If answer is very short compared to expected
  if (expectedLen > 5 && answerLen < expectedLen * 0.3) return 'partial';
  if (answerLen >= expectedLen * 0.7) return 'full';
  return 'sufficient';
}

// ============================================
// Per-Type Handling Hooks
// ============================================

/**
 * Tone/attitude: check if the answer is a recognised tone/attitude label.
 */
const TONE_LABELS = new Set([
  'positive', 'negative', 'neutral', 'critical', 'supportive',
  'sceptical', 'skeptical', 'optimistic', 'pessimistic', 'concerned',
  'humorous', 'serious', 'ironic', 'sarcastic', 'objective',
  'subjective', 'formal', 'informal', 'persuasive', 'informative',
  'sympathetic', 'indifferent', 'enthusiastic', 'cautious',
  'admiring', 'disapproving', 'nostalgic', 'hopeful', 'urgent',
  '正面', '負面', '中立', '批評', '支持',
  '懷疑', '樂觀', '悲觀', '關心', '幽默',
  '嚴肅', '諷刺', '客觀', '主觀', '正式',
  '非正式', '說服', '資訊', '同情', '冷漠',
]);

export function evaluateToneAttitude(answer: string): {
  isRecognisedLabel: boolean;
  note: string;
} {
  const a = normalizeForComparison(answer);
  const isRecognised = TONE_LABELS.has(a);

  return {
    isRecognisedLabel: isRecognised,
    note: isRecognised
      ? 'Recognised tone/attitude label'
      : 'Answer is not a standard tone/attitude label — may need interpretation',
  };
}

// ============================================
// Phase 2A.1: Hardening — Copy Safeguards, POS, Tone, Quality Downgrade
// ============================================

/** Minimum tokens before copy penalty applies (avoids penalizing short answers) */
export function shouldApplyCopyPenalty(answer: string): boolean {
  const tokens = normalizeForComparison(answer).split(' ').filter(Boolean);
  return tokens.length >= 4;
}

/** Detect expected part of speech from question text */
export function detectExpectedPos(questionText: string): 'noun' | 'verb' | 'adjective' | 'adverb' | 'unknown' {
  const q = questionText.toLowerCase();

  if (/\bverb\b/i.test(q)) return 'verb';
  if (/\bnoun\b/i.test(q)) return 'noun';
  if (/\badjective\b/i.test(q)) return 'adjective';
  if (/\badverb\b/i.test(q)) return 'adverb';

  return 'unknown';
}

/** Words considered too vague for tone/attitude answers */
const VAGUE_TONE_WORDS = new Set([
  'good', 'bad', 'positive', 'negative', 'nice', 'sad', 'happy',
  'ok', 'okay', 'fine', 'not good', 'not bad',
]);

/** Check if a tone/attitude answer is too vague to be diagnostically useful */
export function isVagueToneAnswer(answer: string): boolean {
  const a = normalizeForComparison(answer);
  return VAGUE_TONE_WORDS.has(a);
}

/**
 * Apply a quality downgrade WITHOUT flipping correctness.
 * Used for: heavy copying (correct but low quality), vague tone, POS mismatch.
 */
export function applyQualityDowngrade(
  eval_: ReadingAnswerEvaluation,
  reason: string,
): ReadingAnswerEvaluation {
  return {
    ...eval_,
    warnings: [...eval_.warnings, reason],
    paraphraseQuality:
      eval_.paraphraseQuality === 'strong' ? 'adequate'
        : eval_.paraphraseQuality === 'adequate' ? 'limited'
        : eval_.paraphraseQuality,
    grammaticalFitToPrompt:
      eval_.grammaticalFitToPrompt === 'good' ? 'acceptable'
        : eval_.grammaticalFitToPrompt,
  };
}

// ============================================
// Full Evaluation Builder
// ============================================

/**
 * Build a complete ReadingAnswerEvaluation from raw components.
 * Used by the API route to assemble evaluation results.
 */
export function buildEvaluation(params: {
  isCorrect: boolean;
  maxScore: number;
  studentAnswer: string;
  evidence: string;
  questionPrompt: string;
  expectedAnswer: string;
  dseType?: string;
  aiScoreAwarded?: number;
}): ReadingAnswerEvaluation {
  const {
    isCorrect,
    maxScore,
    studentAnswer,
    evidence,
    questionPrompt,
    expectedAnswer,
    dseType,
    aiScoreAwarded,
  } = params;

  const result = createEmptyEvaluation(maxScore);

  // Core correctness
  result.isCorrect = isCorrect;
  result.scoreAwarded = aiScoreAwarded ?? (isCorrect ? maxScore : 0);
  result.maxScore = maxScore;

  // Copying detection
  result.copyingRatio = estimateCopyingRatio(studentAnswer, evidence);
  result.copyingLevel = classifyCopyingLevel(result.copyingRatio);
  result.copyingDetected = result.copyingRatio > 0;

  // Paraphrase quality
  const hasLexicalShift = detectLexicalShift(studentAnswer, evidence);
  const hasStructuralShift = detectStructuralShift(studentAnswer, evidence);
  result.paraphraseQuality = classifyParaphraseQuality({
    copyingRatio: result.copyingRatio,
    hasLexicalShift,
    hasStructuralShift,
  });

  // Grammar fit (fix D: expectations are per blank for multi-blank items)
  const blankCount = countBlanks(questionPrompt, expectedAnswer);
  result.grammaticalFitToPrompt = detectGrammarFit(questionPrompt, studentAnswer, { blankCount });
  if (blankCount > 1) {
    result.notes.push(`Multi-blank item (${blankCount} blanks) — word-form fit judged per blank`);
  }

  // Completeness
  result.completeness = assessCompleteness(studentAnswer, expectedAnswer);

  // Evidence spans
  if (evidence) {
    result.evidenceSpans = [{ excerpt: evidence.slice(0, 300) }];
  }

  // Notes
  if (result.copyingDetected) {
    result.notes.push(
      `Copying detected (${result.copyingLevel}, ${Math.round(result.copyingRatio * 100)}% overlap with source)`,
    );
  }
  if (hasLexicalShift) result.notes.push('Lexical shift detected (synonym substitution)');
  if (hasStructuralShift) result.notes.push('Structural shift detected (reordered/rephrased)');

  // Per-type notes + Phase 2A.1 hardening
  if (dseType === 'vocabulary_in_context') {
    const expectedPos = detectExpectedPos(questionPrompt);
    result.notes.push(
      `Vocabulary-in-context: expected POS=${expectedPos}. Check contextual meaning.`,
    );
    // POS sensitivity: if expected POS is known but answer doesn't look like that POS,
    // downgrade quality (does NOT flip correctness)
    if (expectedPos !== 'unknown') {
      result.notes.push(`POS hint: question expects a ${expectedPos}`);
    }
  }

  if (dseType === 'tone_attitude') {
    const toneCheck = evaluateToneAttitude(studentAnswer);
    result.notes.push(toneCheck.note);

    // Phase 2A.1: Vague tone downgrade
    if (isVagueToneAnswer(studentAnswer)) {
      applyQualityDowngrade(
        result,
        'Tone/attitude answer is too vague to be diagnostically useful — needs specific label',
      );
      // Also reflect in the result
      Object.assign(result, applyQualityDowngrade(result,
        'Tone/attitude answer is too vague to be diagnostically useful — needs specific label'));
    }

    if (!toneCheck.isRecognisedLabel && !isVagueToneAnswer(studentAnswer)) {
      result.notes.push('Answer may be a valid interpretation — verify against marking scheme');
    }
  }

  if (dseType === 'summary_cloze' || dseType === 'sentence_transformation') {
    if (result.grammaticalFitToPrompt === 'poor') {
      result.warnings.push('Grammar does not fit the prompt — check tense/number/POS');
      if (isCorrect) {
        const downgraded = applyQualityDowngrade(result,
          'Grammatically poor answer reduces quality despite semantic correctness');
        Object.assign(result, downgraded);
      }
    }
  }

  // Phase 2A.1: Copying warnings — only for answers long enough to meaningfully copy
  if (result.copyingLevel === 'heavy' && isCorrect && shouldApplyCopyPenalty(studentAnswer)) {
    const downgraded = applyQualityDowngrade(result,
      'Answer is correct but heavily copied from the passage. DSE may deduct marks for lack of paraphrasing.');
    Object.assign(result, downgraded);
  }

  return result;
}
