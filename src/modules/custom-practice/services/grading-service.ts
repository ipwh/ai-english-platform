// ============================================
// Self-Directed Practice — grading service (2026-10-10, Sprint 140)
// ============================================
// Phase 3. Two marking paths, chosen by question type:
//   - OBJECTIVE (mc): deterministic server-side comparison against the key.
//     No AI, no cost, reproducible.
//   - OPEN-ENDED (error_correction, transformation, sentence_production): a
//     rubric-aware AI judgement, SCHEMA-VALIDATED, with two fail-closed rules:
//     fill_blank also uses this semantic path because equivalent answers cannot
//     safely be reduced to exact string comparison.
//       (1) low confidence ⇒ `needs_review` (never an asserted "incorrect");
//       (2) AI unavailable/timeout/malformed ⇒ every open-ended item becomes
//           `needs_review`, and the caller is told grading was degraded.
//     A system failure can therefore never turn into a bad mark for the student
//     — the same fail-closed stance the assignment grader takes.
//
// `needs_review` items are excluded from the awarded total (they are not marked
// as wrong either): the score reflects only what the marker could decide, and
// `needsReviewCount` records the rest.
//
// Bilingual feedback (2026-10-10 v2): every item carries BOTH an English and a
// Traditional-Chinese version of its feedback, so a student with weaker English
// can self-study. The deterministic paths build the Chinese here; the AI path
// asks the marker for it in the same call (never a second, paid translation).
// When the marker omits the Chinese the English is shown alone — a missing
// translation must never become a missing mark.
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

/**
 * "B)", "(b)", "b) had started", "b:" — a student who types the option marker
 * instead of the bare letter. The trailing marker is required, so an answer that
 * merely starts with "a " ("a boy ran…") is never mistaken for option A.
 */
const OPTION_MARKER_ANSWER = /^\(?([a-d])[).:](?:\s|$)/;

function optionMarkerLetter(normalizedAnswer: string): string | null {
  const match = normalizedAnswer.match(OPTION_MARKER_ANSWER);
  return match ? match[1] : null;
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
      rationaleZh: '本題沒有作答。',
      improvement: 'Answer every question before submitting — an unanswered question scores zero.',
      improvementZh: '提交前請回答每一題 —— 未作答的題目不會得分。',
      needsReview: false,
    };
  }

  const candidates = [input.answerKey, ...input.acceptedAnswers].map(normalizeFreeTextAnswer);
  const key = normalizeFreeTextAnswer(input.answerKey);
  // A single-letter key also accepts the option marker however the student typed it
  // ("B)" / "(b)" / "b) had started"): for a letter key that is the same choice, and
  // marking it wrong would tell a student who answered correctly that they did not.
  const matched =
    candidates.includes(answer) || (/^[a-d]$/.test(key) && optionMarkerLetter(answer) === key);
  const verdict: PracticeVerdict = matched ? 'correct' : 'incorrect';

  return {
    questionId: input.questionId,
    verdict,
    awardedMarks: matched ? input.maxMarks : 0,
    maxMarks: input.maxMarks,
    rationale: matched
      ? `Correct. Accepted answer: ${input.answerKey}.`
      : `Incorrect. Expected: ${input.answerKey}.`,
    rationaleZh: matched
      ? `正確。接受的答案：${input.answerKey}。`
      : `不正確。預期答案：${input.answerKey}。`,
    improvement: matched ? null : `Review the rule behind this item, then rewrite the answer as "${input.answerKey}".`,
    improvementZh: matched ? null : `請重溫本題的規則，然後把答案改寫為「${input.answerKey}」。`,
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
export function needsReviewItem(question: OpenEndedQuestionInput, reason: string, reasonZh: string): GradedItem {
  return {
    questionId: question.questionId,
    verdict: 'needs_review',
    awardedMarks: 0,
    maxMarks: question.maxMarks,
    rationale: reason,
    rationaleZh: reasonZh,
    improvement: null,
    improvementZh: null,
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
    items.push(
      needsReviewItem(
        question,
        'No answer was submitted for this question, so it was not marked.',
        '本題沒有作答，因此未評分。'
      )
    );
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
        items.push(
          needsReviewItem(
            question,
            'The marker did not return a verdict for this question, so it was left unmarked.',
            '評分器沒有回覆本題的判定，因此未評分。'
          )
        );
        continue;
      }

      if (result.confidence < OPEN_ENDED_MIN_CONFIDENCE) {
        items.push(
          needsReviewItem(
            question,
            `The marker was not confident enough to mark this answer (confidence ${result.confidence.toFixed(2)}). ${result.rationale}`,
            joinChinese(
              `評分器對本題的信心不足（信心值 ${result.confidence.toFixed(2)}），因此未評分。`,
              result.rationaleZh
            )
          )
        );
        continue;
      }

      const awardedMarks = clampMarks(result.awardedMarks, question.maxMarks);
      const verdict: PracticeVerdict = awardedMarks >= question.maxMarks ? 'correct' : awardedMarks > 0 ? 'partially_correct' : result.verdict;
      const improvement = result.improvement ?? null;

      items.push({
        questionId: question.questionId,
        verdict,
        awardedMarks,
        maxMarks: question.maxMarks,
        rationale: result.rationale,
        rationaleZh: result.rationaleZh ?? null,
        improvement,
        // A Chinese suggestion without an English one (or the reverse) would be
        // half a pair: keep them aligned.
        improvementZh: improvement ? result.improvementZh ?? null : null,
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
          'The automatic marker was unavailable, so this answer was NOT marked. It has been flagged for review.',
          '自動評分暫時無法使用，因此本題未評分，已標示待審。'
        )
      );
    }
    return { items, promptVersion: null, degraded: true };
  }
}

/** Joins a Chinese sentence with an optional further Chinese sentence. */
function joinChinese(first: string, second: string | null | undefined): string {
  const extra = second?.trim();
  return extra ? `${first} ${extra}` : first;
}

/** Deterministic overall feedback; never invents praise and never claims DSE validity. */
export function buildOverallFeedback(items: readonly GradedItem[]): { en: string; zh: string } {
  const count = (verdict: PracticeVerdict) => items.filter(item => item.verdict === verdict).length;
  const parts = [
    `${count('correct')} correct`,
    `${count('partially_correct')} partially correct`,
    `${count('incorrect')} incorrect`,
  ];
  const review = count('needs_review');
  if (review > 0) parts.push(`${review} awaiting review`);

  const en = [
    `Auto-marked practice result: ${parts.join(', ')}.`,
    'This is AI-assisted practice marking for self-study — it is not a validated HKDSE score.',
    review > 0 ? 'Items awaiting review were not marked as wrong; ask your teacher to look at them.' : '',
  ]
    .filter(line => line.length > 0)
    .join(' ');

  const zhParts = [
    `正確 ${count('correct')} 題`,
    `部分正確 ${count('partially_correct')} 題`,
    `不正確 ${count('incorrect')} 題`,
  ];
  if (review > 0) zhParts.push(`待審（未評分）${review} 題`);

  const zh = [
    `自動批改結果：${zhParts.join('、')}。`,
    '此為 AI 輔助自學批改，並非考評局評分。',
    review > 0 ? '待審的題目沒有被判定為答錯，請老師協助查看。' : '',
  ]
    .filter(line => line.length > 0)
    .join('');

  return { en, zh };
}

export function objectiveQuestionIds(questions: readonly { questionId: string; questionType: string }[]): string[] {
  return questions.filter(question => isObjectiveQuestionType(question.questionType)).map(question => question.questionId);
}
