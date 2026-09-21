import {
  verifyGeneratedAnswers,
  type AnswerVerificationDrop,
  type AnswerVerificationOptions,
} from '@/modules/ai/services/answer-verification';
import type { GeneratedQuestion } from '@/modules/ai/types/generation-types';

export interface ReadingDeliveryQuestion {
  type?: unknown;
  dseType?: unknown;
  question?: unknown;
  questionZh?: unknown;
  choices?: unknown;
  answer?: unknown;
  explanationZh?: unknown;
  explanationEn?: unknown;
  [key: string]: unknown;
}

export interface ReadingAnswerVerificationResult {
  kept: ReadingDeliveryQuestion[];
  dropped: AnswerVerificationDrop[];
  verifierUnavailable: boolean;
}

function stripChoicePrefix(value: string): string {
  return value.replace(/^\s*[A-D][).:\-、]\s*/i, '').trim();
}

/** Convert a persisted reading key to the option letter expected by the blind verifier. */
function resolveOptionLetter(answer: string, choices: string[]): string {
  const trimmed = answer.trim();
  if (/^[A-D]$/i.test(trimmed)) return trimmed.toUpperCase();

  const normalized = stripChoicePrefix(trimmed).toLowerCase();
  const index = choices.findIndex(choice => stripChoicePrefix(choice).toLowerCase() === normalized);
  return index >= 0 ? String.fromCharCode(65 + index) : trimmed;
}

function isObjectivelyScored(question: ReadingDeliveryQuestion): boolean {
  return question.type === 'mc'
    || question.dseType === 'summary_cloze'
    || question.dseType === 'sentence_transformation'
    || (typeof question.question === 'string'
      && typeof question.answer === 'string'
      && question.answer.includes(',')
      && /\b(order|arrange|sequence)\b/i.test(question.question));
}

/**
 * Applies the canonical answer gate to delivery-time reading objective items.
 * The original question objects and answer formats are preserved for
 * server-authoritative reading scoring; only MCQs receive a normalized option
 * letter, while cloze and transformation items are blind-solved as text.
 */
export async function verifyReadingQuestionsForDelivery(
  questions: ReadingDeliveryQuestion[],
  readingContent: string,
  options: AnswerVerificationOptions = {},
): Promise<ReadingAnswerVerificationResult> {
  const candidates = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => isObjectivelyScored(question));

  if (candidates.length === 0) {
    return { kept: questions, dropped: [], verifierUnavailable: false };
  }

  const generated = candidates.map(({ question }): GeneratedQuestion => {
    const choices = Array.isArray(question.choices) ? question.choices.map(String) : [];
    const answer = resolveOptionLetter(String(question.answer ?? ''), choices);
    const isMcq = question.type === 'mc';
    return {
      type: isMcq ? 'mc' : 'fill-blank',
      prompt: String(question.question ?? ''),
      promptZh: typeof question.questionZh === 'string' ? question.questionZh : undefined,
      choices,
      answer: isMcq ? answer : String(question.answer ?? ''),
      explanationZh: typeof question.explanationZh === 'string' ? question.explanationZh : '',
      explanationEn: typeof question.explanationEn === 'string' ? question.explanationEn : '',
      commonMistake: '',
      readingContent,
      verificationExpectedChoiceCount: isMcq && question.dseType === 'true_false_not_given' ? 3 : 4,
    };
  });

  const verified = await verifyGeneratedAnswers(generated, options);
  const keptCandidateIndexes = new Set(
    verified.kept.map(question => generated.indexOf(question)),
  );
  const droppedOriginalIndexes = new Set(
    candidates
      .filter((_, candidateIndex) => !keptCandidateIndexes.has(candidateIndex))
      .map(({ index }) => index),
  );

  return {
    kept: questions.filter((_, index) => !droppedOriginalIndexes.has(index)),
    dropped: verified.dropped.map(drop => ({
      ...drop,
      index: (candidates[drop.index - 1]?.index ?? drop.index - 1) + 1,
    })),
    verifierUnavailable: verified.verifierUnavailable,
  };
}