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
  spec: PracticeSpec
): ValidateGeneratedQuestionsResult {
  const valid: ValidatedQuestion[] = [];
  const dropped: DroppedQuestion[] = [];
  const seenPrompts = new Set<string>();

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

    if (valid.length >= spec.questionCount) {
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
  promptVersion: string;
}

export async function generateCustomPracticeSet(input: {
  ownerUserId: string;
  spec: PracticeSpec;
}): Promise<GeneratePracticeSetResult> {
  const { ownerUserId, spec } = input;

  const generated = await generateCustomPracticeWithAI({
    requestText: spec.requestText,
    objective: spec.objective,
    category: spec.category,
    difficulty: spec.difficulty,
    questionCount: spec.questionCount,
    exerciseTypes: spec.exerciseTypes,
  });

  const { valid, dropped } = validateGeneratedQuestions(generated.questions, spec);

  if (valid.length === 0) {
    logger.warn(
      { module: 'custom-practice', ownerUserId, dropped: dropped.slice(0, 5) },
      'custom practice generation produced no usable question'
    );
    throw new CustomPracticeError(
      'GENERATION_FAILED',
      'The generated exercise did not pass validation. Please try again with a slightly different request.',
      { dropped }
    );
  }

  const persisted = await persistGeneratedSet({
    ownerUserId,
    spec,
    promptVersion: generated.promptVersion,
    model: null,
    questions: valid,
  });

  if (valid.length < spec.questionCount) {
    logger.warn(
      { module: 'custom-practice', ownerUserId, requested: spec.questionCount, delivered: valid.length },
      'custom practice delivered fewer questions than requested'
    );
  }

  return {
    setId: persisted.setId,
    deliveredCount: valid.length,
    requestedCount: spec.questionCount,
    shortfall: spec.questionCount - valid.length,
    droppedCount: dropped.length,
    promptVersion: generated.promptVersion,
  };
}
