// ============================================
// Self-Directed Practice — generation service (2026-10-10, Sprint 140)
// ============================================
// Phase 2 steps 3–4: the server generates items and then VALIDATES them before
// anything is persisted or delivered. The deterministic gate below is the single
// owner of "is this generated item acceptable?":
//   - question type must be one the student actually asked for;
//   - an mc item must carry exactly four lettered options and a single-letter key;
//   - the key, rubric, target rule and explanation must be non-empty and coherent
//     (rubric.marks === maxMarks);
//   - duplicate tested points (identical prompt text) are dropped.
// Invalid items are DROPPED with a reason; when nothing survives we fail with a
// structured error instead of delivering an empty or padded exercise.
// The shortfall (requested vs delivered) is reported honestly, never hidden.
// ============================================

import { generateCustomPracticeWithAI, type CustomPracticeGeneratedQuestion } from '@/modules/ai';
import { logger } from '@/shared/logger/logger';
import { CustomPracticeError, type PracticeSpec, type PracticeQuestionType, type ValidatedQuestion } from '../domain/types';
import { persistGeneratedSet } from '../repositories/custom-practice-repo';
import { MAX_REGENERATION_ROUNDS, verifyGeneratedQuestions } from './verification-service';

export interface DroppedQuestion {
  index: number;
  reason: string;
}

export interface ValidateGeneratedQuestionsResult {
  valid: ValidatedQuestion[];
  dropped: DroppedQuestion[];
}

function normalizedPromptKey(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countOptionMarkers(prompt: string): number {
  return (prompt.match(/(?:^|[\s(])([A-D])[).]\s/g) ?? []).length;
}

/** Deterministic gate. Exported so it can be unit-tested without any AI call. */
export function validateGeneratedQuestions(
  generated: readonly CustomPracticeGeneratedQuestion[],
  spec: PracticeSpec,
  options: { excludePrompts?: readonly string[]; limit?: number } = {}
): ValidateGeneratedQuestionsResult {
  const valid: ValidatedQuestion[] = [];
  const dropped: DroppedQuestion[] = [];
  // Cross-round dedupe: prompts already accepted in an earlier round must not
  // reappear as "new" questions.
  const seenPrompts = new Set<string>((options.excludePrompts ?? []).map(normalizedPromptKey));
  const limit = options.limit ?? spec.questionCount;

  generated.forEach((question, index) => {
    const drop = (reason: string) => dropped.push({ index, reason });

    if (!spec.exerciseTypes.includes(question.questionType as PracticeQuestionType)) {
      drop(`question type ${question.questionType} was not requested`);
      return;
    }

    if (question.rubric.marks !== question.maxMarks) {
      drop(`rubric marks (${question.rubric.marks}) do not match maxMarks (${question.maxMarks})`);
      return;
    }

    if (!question.targetRule.trim() || !question.explanationEn.trim() || !question.answerKey.trim()) {
      drop('missing target rule, explanation or answer key');
      return;
    }

    if (question.questionType === 'mc') {
      const key = question.answerKey.trim().toUpperCase();
      if (!/^[A-D]$/.test(key)) {
        drop(`mc answer key "${question.answerKey}" is not a single option letter`);
        return;
      }
      if (countOptionMarkers(question.prompt) !== 4) {
        drop('mc prompt does not present exactly four lettered options');
        return;
      }
    }

    const promptKey = normalizedPromptKey(question.prompt);
    if (seenPrompts.has(promptKey)) {
      drop('duplicate tested point (identical prompt)');
      return;
    }
    seenPrompts.add(promptKey);

    if (valid.length >= limit) {
      drop('exceeds the requested question count');
      return;
    }

    const accepted = Array.from(
      new Set(question.acceptedAnswers.map(answer => answer.trim()).filter(answer => answer.length > 0))
    );

    valid.push({
      orderIndex: valid.length,
      questionType: question.questionType as PracticeQuestionType,
      instructions: question.instructions.trim(),
      prompt: question.prompt.trim(),
      answerKey: question.answerKey.trim(),
      acceptedAnswers: accepted,
      rejectedAnswers: question.rejectedAnswers.map(item => ({ answer: item.answer.trim(), why: item.why.trim() })),
      rubric: { marks: question.rubric.marks, criteria: question.rubric.criteria.map(criterion => criterion.trim()) },
      targetRule: question.targetRule.trim(),
      explanationZh: question.explanationZh ? question.explanationZh.trim() : null,
      explanationEn: question.explanationEn.trim(),
      misconceptionTags: question.misconceptionTags.map(tag => tag.trim()).filter(tag => tag.length > 0),
      maxMarks: question.maxMarks,
    });
  });

  return { valid, dropped };
}

export interface GeneratePracticeSetResult {
  setId: string;
  deliveredCount: number;
  requestedCount: number;
  shortfall: number;
  droppedCount: number;
  /** Items thrown away by the blind verification pass. */
  rejectedByVerification: number;
  regenerationRounds: number;
  promptVersion: string;
  verificationPromptVersion: string | null;
}

export async function generateCustomPracticeSet(input: {
  ownerUserId: string;
  spec: PracticeSpec;
}): Promise<GeneratePracticeSetResult> {
  const { ownerUserId, spec } = input;

  const accepted: ValidatedQuestion[] = [];
  const rejectedReasons: string[] = [];
  let droppedCount = 0;
  let rounds = 0;
  let generationPromptVersion = '';
  let verificationPromptVersion: string | null = null;

  // Bounded regeneration: at most MAX_REGENERATION_ROUNDS extra rounds, and the
  // loop stops as soon as a round makes no progress — it can never run forever,
  // and it never lowers the quality bar to reach the requested count.
  while (rounds <= MAX_REGENERATION_ROUNDS && accepted.length < spec.questionCount) {
    rounds += 1;
    const deficit = spec.questionCount - accepted.length;

    const generated = await generateCustomPracticeWithAI({
      requestText: spec.requestText,
      objective: spec.objective,
      category: spec.category,
      difficulty: spec.difficulty,
      questionCount: Math.max(deficit, 1),
      exerciseTypes: spec.exerciseTypes,
    });
    generationPromptVersion = generated.promptVersion;

    const { valid, dropped } = validateGeneratedQuestions(generated.questions, spec, {
      excludePrompts: accepted.map(question => question.prompt),
      limit: deficit,
    });
    droppedCount += dropped.length;

    const verification = await verifyGeneratedQuestions({ spec, questions: valid });
    verificationPromptVersion = verification.verificationPromptVersion ?? verificationPromptVersion;

    if (!verification.verifierAvailable) {
      // Fail closed: delivering unverified questions would silently lower the bar.
      throw new CustomPracticeError(
        'GENERATION_FAILED',
        'The questions could not be verified just now, so nothing was delivered. Please try again in a moment.',
        { verifierAvailable: false, rounds }
      );
    }

    accepted.push(...verification.accepted);
    for (const rejection of verification.rejected) rejectedReasons.push(rejection.reason);

    if (verification.accepted.length === 0) break;
  }

  if (accepted.length === 0) {
    logger.warn(
      { module: 'custom-practice', ownerUserId, rejectedReasons: rejectedReasons.slice(0, 5) },
      'custom practice: nothing survived validation + blind verification'
    );
    throw new CustomPracticeError(
      'GENERATION_FAILED',
      'The generated exercise did not pass validation and verification. Please try again with a slightly different request.',
      { rejectedReasons: rejectedReasons.slice(0, 5) }
    );
  }

  const verificationMeta = JSON.stringify({
    status: accepted.length === spec.questionCount ? 'verified' : 'verified_shortfall',
    rounds,
    accepted: accepted.length,
    rejected: rejectedReasons.length,
    promptVersions: {
      generation: generationPromptVersion,
      verification: verificationPromptVersion,
    },
  });

  const persisted = await persistGeneratedSet({
    ownerUserId,
    spec,
    promptVersion: generationPromptVersion,
    model: null,
    verificationMeta,
    // Re-index across rounds: orderIndex is unique per set, and each round starts
    // numbering at zero.
    questions: accepted.map((question, index) => ({ ...question, orderIndex: index })),
  });

  if (accepted.length < spec.questionCount) {
    logger.warn(
      { module: 'custom-practice', ownerUserId, requested: spec.questionCount, delivered: accepted.length },
      'custom practice delivered fewer verified questions than requested'
    );
  }

  return {
    setId: persisted.setId,
    deliveredCount: accepted.length,
    requestedCount: spec.questionCount,
    shortfall: spec.questionCount - accepted.length,
    droppedCount,
    rejectedByVerification: rejectedReasons.length,
    regenerationRounds: rounds,
    promptVersion: generationPromptVersion,
    verificationPromptVersion,
  };
}
