// ============================================
// Self-Directed Practice — generation verification (Sprint 141, P0 #1)
// ============================================
// Reduces incorrect answer keys by INDEPENDENTLY solving each generated question
// and comparing the result with the proposed key. Responsibilities stay separate:
//   generation-service  → asks the model for items, applies the deterministic gate
//   verification-service→ judges those items (this file)
//   grading-service     → marks a student's answers
//
// Order of operations (important):
//   1. deterministic screen — contradictions detectable without any model call;
//   2. blind solve — the verifier answers WITHOUT seeing the key;
//   3. comparison — objective items compared by normalized text; open-ended items
//      checked by feeding the verifier's OWN answer into the grading usecase
//      against the proposed rubric (a rejected independent solution means the item
//      or its key is suspect).
//
// A second model pass REDUCES wrong keys; it does not guarantee correctness, and
// nothing here claims that. Fail-closed: when the verifier cannot run, nothing is
// accepted (the caller returns a structured, retryable error) — the quality bar is
// never lowered silently.
// ============================================

import { gradeCustomPracticeWithAI, verifyCustomPracticeWithAI } from '@/modules/ai';
import { logger } from '@/shared/logger/logger';
import { isObjectiveQuestionType, type PracticeSpec, type ValidatedQuestion } from '../domain/types';
import { normalizeFreeTextAnswer, OPEN_ENDED_MIN_CONFIDENCE } from './grading-service';

export const MAX_REGENERATION_ROUNDS = 1;

export interface VerificationRejection {
  index: number;
  reason: string;
}

export interface VerificationOutcome {
  accepted: ValidatedQuestion[];
  rejected: VerificationRejection[];
  /** False when the blind pass could not run at all (provider/timeout/schema). */
  verifierAvailable: boolean;
  verificationPromptVersion: string | null;
}

/** The item text the verifier is allowed to see — no key, no explanations. */
interface BlindItem {
  index: number;
  question: ValidatedQuestion;
}

function blindItemPayload(item: BlindItem) {
  return {
    index: item.index,
    questionType: item.question.questionType,
    instructions: item.question.instructions,
    prompt: item.question.prompt,
    targetRule: item.question.targetRule,
    rubric: JSON.stringify(item.question.rubric),
  };
}

/** Deterministic contradiction screen — runs before any model call. */
export function screenForDeterministicDefects(questions: readonly ValidatedQuestion[]): VerificationRejection[] {
  const rejections: VerificationRejection[] = [];

  questions.forEach((question, index) => {
    const instructions = question.instructions.toLowerCase();

    // "Choose two answers" cannot be marked with a single-answer key.
    if (/\b(two|three|both)\b/.test(instructions) && question.questionType === 'mc' && question.rubric.marks === 1) {
      rejections.push({ index, reason: 'instructions ask for more than one answer but the item is keyed as a single-answer item' });
      return;
    }

    // A rubric whose criteria never mention the target rule is a coherence risk.
    const criteriaText = question.rubric.criteria.join(' ').toLowerCase();
    const ruleWords = question.targetRule.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    if (ruleWords.length > 1 && !ruleWords.some(word => criteriaText.includes(word))) {
      rejections.push({ index, reason: 'rubric criteria do not reference the stated target rule' });
      return;
    }

    // An explanation that admits the item is broken must never reach a student.
    const explanation = question.explanationEn.toLowerCase();
    if (/(is (incorrect|wrong|ambiguous)|cannot be determined|no correct (answer|option))/.test(explanation)) {
      rejections.push({ index, reason: 'the explanation itself states the item is defective' });
    }
  });

  return rejections;
}

export async function verifyGeneratedQuestions(input: {
  spec: PracticeSpec;
  questions: readonly ValidatedQuestion[];
}): Promise<VerificationOutcome> {
  const deterministicRejections = screenForDeterministicDefects(input.questions);
  const rejectedIndexes = new Set(deterministicRejections.map(rejection => rejection.index));

  const candidates: BlindItem[] = input.questions
    .map((question, index) => ({ index, question }))
    .filter(item => !rejectedIndexes.has(item.index));

  if (candidates.length === 0) {
    return {
      accepted: [],
      rejected: deterministicRejections,
      verifierAvailable: true,
      verificationPromptVersion: null,
    };
  }

  let verification: Awaited<ReturnType<typeof verifyCustomPracticeWithAI>>;
  try {
    verification = await verifyCustomPracticeWithAI({
      category: input.spec.category,
      difficulty: input.spec.difficulty,
      items: candidates.map(blindItemPayload),
    });
  } catch (error) {
    logger.error(
      { module: 'custom-practice', error: error instanceof Error ? error.message : String(error) },
      'blind verification unavailable — refusing to deliver unverified questions'
    );
    return {
      accepted: [],
      rejected: [...deterministicRejections, ...candidates.map(item => ({ index: item.index, reason: 'verifier unavailable' }))],
      verifierAvailable: false,
      verificationPromptVersion: null,
    };
  }

  const byIndex = new Map(verification.results.map(result => [result.index, result]));
  const accepted: ValidatedQuestion[] = [];
  const rejected: VerificationRejection[] = [...deterministicRejections];

  // Open-ended items are compared through the grading usecase (rubric-aware) rather
  // than by string equality; collect those that still need that second step.
  const openEndedToCheck: Array<{ item: BlindItem; blindAnswer: string }> = [];

  for (const item of candidates) {
    const result = byIndex.get(item.index);
    if (!result) {
      rejected.push({ index: item.index, reason: 'the verifier returned no result for this item' });
      continue;
    }
    if (result.ambiguous) {
      rejected.push({ index: item.index, reason: `verifier found the question ambiguous: ${result.ambiguousReason ?? 'no reason given'}` });
      continue;
    }
    if (!result.rubricSatisfiable) {
      rejected.push({ index: item.index, reason: 'verifier found the rubric unsatisfiable as written' });
      continue;
    }
    if (result.issue) {
      rejected.push({ index: item.index, reason: `verifier reported a defect: ${result.issue}` });
      continue;
    }
    if (result.confidence < OPEN_ENDED_MIN_CONFIDENCE) {
      rejected.push({ index: item.index, reason: `verifier was not confident enough (${result.confidence.toFixed(2)})` });
      continue;
    }

    if (isObjectiveQuestionType(item.question.questionType)) {
      const blind = normalizeFreeTextAnswer(result.answer);
      const candidatesForItem = [item.question.answerKey, ...item.question.acceptedAnswers].map(normalizeFreeTextAnswer);
      if (blind.length === 0 || !candidatesForItem.includes(blind)) {
        rejected.push({
          index: item.index,
          reason: `independent answer "${result.answer}" does not match the proposed key "${item.question.answerKey}"`,
        });
        continue;
      }
      accepted.push(item.question);
      continue;
    }

    openEndedToCheck.push({ item, blindAnswer: result.answer });
  }

  if (openEndedToCheck.length > 0) {
    try {
      const graded = await gradeCustomPracticeWithAI({
        category: input.spec.category,
        difficulty: input.spec.difficulty,
        items: openEndedToCheck.map(({ item, blindAnswer }) => ({
          questionId: `verify-${item.index}`,
          questionType: item.question.questionType,
          instructions: item.question.instructions,
          prompt: item.question.prompt,
          targetRule: item.question.targetRule,
          rubric: JSON.stringify(item.question.rubric),
          maxMarks: item.question.maxMarks,
          referenceAnswer: item.question.answerKey,
          acceptedAnswers: item.question.acceptedAnswers,
          rejectedAnswers: item.question.rejectedAnswers.map(rejection => rejection.answer),
          studentAnswer: blindAnswer,
        })),
      });

      const gradedById = new Map(graded.results.map(result => [result.questionId, result]));

      for (const { item, blindAnswer } of openEndedToCheck) {
        const result = gradedById.get(`verify-${item.index}`);
        if (!result || result.confidence < OPEN_ENDED_MIN_CONFIDENCE) {
          rejected.push({ index: item.index, reason: 'the rubric check was inconclusive for this open-ended item' });
          continue;
        }
        if (result.verdict === 'incorrect') {
          rejected.push({
            index: item.index,
            reason: `an independent solution ("${blindAnswer.slice(0, 80)}") was rejected by the proposed rubric/key`,
          });
          continue;
        }
        accepted.push(item.question);
      }
    } catch (error) {
      logger.error(
        { module: 'custom-practice', error: error instanceof Error ? error.message : String(error) },
        'rubric check unavailable for open-ended items — dropping them rather than delivering unverified content'
      );
      for (const { item } of openEndedToCheck) {
        rejected.push({ index: item.index, reason: 'the rubric check could not run' });
      }
    }
  }

  return {
    accepted,
    rejected,
    verifierAvailable: true,
    verificationPromptVersion: verification.promptVersion,
  };
}
