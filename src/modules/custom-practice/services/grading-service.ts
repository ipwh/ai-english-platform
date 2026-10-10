// ============================================
// Self-Directed Practice — grading service (2026-10-10, Sprint 140)
// ============================================
// Phase 3. Two marking paths, chosen by question type:
//   - OBJECTIVE (mc, fill_blank): deterministic server-side comparison against
//     the key plus the model's accepted variants. No AI, no cost, reproducible.
//   - OPEN-ENDED (error_correction, transformation, sentence_production): a
//     rubric-aware AI judgement, SCHEMA-VALIDATED, with two fail-closed rules:
//       (1) low confidence ⇒ `needs_review` (never an asserted "incorrect");
//       (2) AI unavailable/timeout/malformed ⇒ every open-ended item becomes
//           `needs_review`, and the caller is told grading was degraded.
//     A system failure can therefore never turn into a bad mark for the student
//     — the same fail-closed stance the assignment grader takes.
//
// `needs_review` items are excluded from the awarded total (they are not marked
// as wrong either): the score reflects only what the marker could decide, and
// `needsReviewCount` records the rest.
// ============================================

import { gradeCustomPracticeWithAI } from '@/modules/ai';
import { logger } from '@/shared/logger/logger';
import type { GradedItem, PracticeSpec, PracticeVerdict } from '../domain/types';
import { isObjectiveQuestionType } from '../domain/types';

/** Below this model confidence we refuse to assert a verdict. */
export const OPEN_ENDED_MIN_CONFIDENCE = 0.6;

/** Deterministic normalization for objective comparison. */
export function normalizeFreeTextAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    // Trailing punctuation is stripped AFTER whitespace collapsing, and trailing
    // spaces must be tolerated or "sat. " would keep its full stop.
    .replace(/[.!?,;:]+\s*$/, '')
    .trim();
}

export interface ObjectiveGradingInput {
  questionId: string;
  answerText: string;
  answerKey: string;
  acceptedAnswers: readonly string[];
  maxMarks: number;
}

export function gradeObjectiveItem(input: ObjectiveGradingInput): GradedItem {
  const answer = normalizeFreeTextAnswer(input.answerText);

  if (answer.length === 0) {
    return {
      questionId: input.questionId,
      verdict: 'incorrect',
      awardedMarks: 0,
      maxMarks: input.maxMarks,
      rationale: 'No answer was submitted for this question.',
      improvement: 'Answer every question before submitting — an unanswered question scores zero.',
      needsReview: false,
    };
  }

  const candidates = [input.answerKey, ...input.acceptedAnswers].map(normalizeFreeTextAnswer);
  const matched = candidates.includes(answer);
  const verdict: PracticeVerdict = matched ? 'correct' : 'incorrect';

  return {
    questionId: input.questionId,
    verdict,
    awardedMarks: matched ? input.maxMarks : 0,
    maxMarks: input.maxMarks,
    rationale: matched
      ? `Correct. Accepted answer: ${input.answerKey}.`
      : `Incorrect. Expected: ${input.answerKey}.`,
    improvement: matched ? null : `Review the rule behind this item, then rewrite the answer as "${input.answerKey}".`,
    needsReview: false,
  };
}

export interface OpenEndedQuestionInput {
  questionId: string;
  questionType: string;
  instructions: string;
  prompt: string;
  targetRule: string;
  rubric: string;
  maxMarks: number;
  answerKey: string;
  acceptedAnswers: readonly string[];
  rejectedAnswers: Array<{ answer: string; why: string }>;
  explanationEn: string;
  answerText: string;
}

function clampMarks(value: number, maxMarks: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maxMarks, Math.round(value)));
}

/** Fallback for every open-ended item we could not mark — never "incorrect". */
export function needsReviewItem(question: OpenEndedQuestionInput, reason: string): GradedItem {
  return {
    questionId: question.questionId,
    verdict: 'needs_review',
    awardedMarks: 0,
    maxMarks: question.maxMarks,
    rationale: reason,
    improvement: null,
    needsReview: true,
  };
}

export interface GradePracticeSetResult {
  items: GradedItem[];
  promptVersion: string | null;
  /** True when at least one item could not be marked by the AI marker. */
  degraded: boolean;
}

export async function gradeCustomPracticeAnswers(input: {
  spec: Pick<PracticeSpec, 'category' | 'difficulty'>;
  questions: OpenEndedQuestionInput[];
  objective: ObjectiveGradingInput[];
}): Promise<GradePracticeSetResult> {
  const items: GradedItem[] = input.objective.map(gradeObjectiveItem);

  const answerable = input.questions.filter(question => question.answerText.trim().length > 0);
  const unanswered = input.questions.filter(question => question.answerText.trim().length === 0);
  for (const question of unanswered) {
    items.push(needsReviewItem(question, 'No answer was submitted for this question, so it was not marked.'));
  }

  if (answerable.length === 0) {
    return { items, promptVersion: null, degraded: items.some(item => item.needsReview) };
  }

  try {
    const graded = await gradeCustomPracticeWithAI({
      category: input.spec.category,
      difficulty: input.spec.difficulty,
      items: answerable.map(question => ({
        questionId: question.questionId,
        questionType: question.questionType,
        instructions: question.instructions,
        prompt: question.prompt,
        targetRule: question.targetRule,
        rubric: question.rubric,
        maxMarks: question.maxMarks,
        referenceAnswer: question.answerKey,
        acceptedAnswers: question.acceptedAnswers,
        rejectedAnswers: question.rejectedAnswers.map(item => item.answer),
        studentAnswer: question.answerText,
      })),
    });

    const byId = new Map(graded.results.map(result => [result.questionId, result]));

    for (const question of answerable) {
      const result = byId.get(question.questionId);
      if (!result) {
        items.push(needsReviewItem(question, 'The marker did not return a verdict for this question, so it was left unmarked.'));
        continue;
      }

      if (result.confidence < OPEN_ENDED_MIN_CONFIDENCE) {
        items.push(
          needsReviewItem(
            question,
            `The marker was not confident enough to mark this answer (confidence ${result.confidence.toFixed(2)}). ${result.rationale}`
          )
        );
        continue;
      }

      const awardedMarks = clampMarks(result.awardedMarks, question.maxMarks);
      const verdict: PracticeVerdict = awardedMarks >= question.maxMarks ? 'correct' : awardedMarks > 0 ? 'partially_correct' : result.verdict;

      items.push({
        questionId: question.questionId,
        verdict,
        awardedMarks,
        maxMarks: question.maxMarks,
        rationale: result.rationale,
        improvement: result.improvement ?? null,
        needsReview: false,
      });
    }

    return { items, promptVersion: graded.promptVersion, degraded: items.some(item => item.needsReview) };
  } catch (error) {
    logger.error(
      { module: 'custom-practice', error: error instanceof Error ? error.message : String(error) },
      'custom practice AI grading failed — marking open-ended items as needs_review'
    );
    for (const question of answerable) {
      items.push(
        needsReviewItem(
          question,
          'The automatic marker was unavailable, so this answer was NOT marked. It has been flagged for review.'
        )
      );
    }
    return { items, promptVersion: null, degraded: true };
  }
}

/** Deterministic overall feedback; never invents praise and never claims DSE validity. */
export function buildOverallFeedback(items: readonly GradedItem[]): string {
  const count = (verdict: PracticeVerdict) => items.filter(item => item.verdict === verdict).length;
  const parts = [
    `${count('correct')} correct`,
    `${count('partially_correct')} partially correct`,
    `${count('incorrect')} incorrect`,
  ];
  const review = count('needs_review');
  if (review > 0) parts.push(`${review} awaiting review`);

  return [
    `Auto-marked practice result: ${parts.join(', ')}.`,
    'This is AI-assisted practice marking for self-study — it is not a validated HKDSE score.',
    review > 0 ? 'Items awaiting review were not marked as wrong; ask your teacher to look at them.' : '',
  ]
    .filter(line => line.length > 0)
    .join(' ');
}

export function objectiveQuestionIds(questions: readonly { questionId: string; questionType: string }[]): string[] {
  return questions.filter(question => isObjectiveQuestionType(question.questionType)).map(question => question.questionId);
}
