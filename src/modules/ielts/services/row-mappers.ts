// ============================================
// IELTS Row Mappers — Prisma row ↔ domain objects
// ============================================
// JSON columns are stored as TEXT strings (project convention). All parsing is
// defensive: a malformed field degrades to a safe default instead of throwing,
// but callers treat missing keys as INVALID_QUESTION at scoring time.
// ============================================

import type { IeltsQuestion } from '@prisma/client';
import type {
  IeltsAnswerKey,
  IeltsContentSource,
  IeltsDifficulty,
  IeltsItemEvidence,
  IeltsOption,
  IeltsQuestionDefinition,
  IeltsQuestionType,
  IeltsSkill,
  IeltsValidationStatus,
  IeltsWordLimit,
} from '../domain/types';
import type { IeltsScorableItem } from '../scoring/objective-scorer';

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToQuestionDefinition(row: IeltsQuestion): IeltsQuestionDefinition {
  return {
    id: row.id,
    testId: row.testId,
    sectionId: row.sectionId,
    orderIndex: row.orderIndex,
    questionType: row.questionType as IeltsQuestionType,
    skill: row.skill as IeltsSkill,
    prompt: row.prompt,
    options: parseJson<IeltsOption[] | string[] | undefined>(row.options, undefined),
    answerKey: parseJson<IeltsAnswerKey | undefined>(row.answerKey, undefined),
    acceptedAnswers: parseJson<string[] | undefined>(row.acceptedAnswers, undefined),
    wordLimit: parseJson<IeltsWordLimit | undefined>(row.wordLimit, undefined),
    evidence: parseJson<IeltsItemEvidence | undefined>(row.evidence, undefined),
    explanation: row.explanation ?? undefined,
    difficulty: row.difficulty as IeltsDifficulty,
    difficultyModel: row.difficultyModel ?? undefined,
    contentSource: parseJson<IeltsContentSource>(row.contentSource, { type: 'ORIGINAL_GENERATED' }),
    generatorVersion: row.generatorVersion ?? undefined,
    validationStatus: row.validationStatus as IeltsValidationStatus,
  };
}

export function rowToScorableItem(row: IeltsQuestion): IeltsScorableItem {
  const definition = rowToQuestionDefinition(row);
  return {
    questionType: definition.questionType,
    options: (definition.options as IeltsScorableItem['options']) ?? null,
    answerKey: definition.answerKey ?? null,
    acceptedAnswers: definition.acceptedAnswers ?? null,
    wordLimit: definition.wordLimit ?? null,
  };
}

/** Client-safe projection: NO answer key / accepted answers / evidence. */
export function rowToClientQuestion(row: IeltsQuestion) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    orderIndex: row.orderIndex,
    questionType: row.questionType,
    skill: row.skill,
    prompt: row.prompt,
    options: parseJson<IeltsOption[] | string[] | undefined>(row.options, undefined),
    wordLimit: parseJson<IeltsWordLimit | undefined>(row.wordLimit, undefined),
    difficulty: row.difficulty,
  };
}

/** Feedback projection (only after submission): key + explanation + evidence. */
export function rowToFeedback(row: IeltsQuestion) {
  return {
    questionId: row.id,
    answerKey: parseJson<IeltsAnswerKey | undefined>(row.answerKey, undefined),
    acceptedAnswers: parseJson<string[] | undefined>(row.acceptedAnswers, undefined),
    explanation: row.explanation ?? null,
    evidence: parseJson<IeltsItemEvidence | undefined>(row.evidence, undefined),
  };
}
