// ============================================
// R3.7: Reading Question Service — server-owned definitions
// ============================================
// Question-definition authority:
// - At generation time the server persists each question's canonical
//   definition (answer key, marks, choices, dseType) and assigns the
//   persisted id as its identity.
// - Historical `rd-*` runtime ids have no stored definition and can
//   NEVER be resolved — they remain NOT_PROJECTABLE.
// ============================================

import { randomUUID } from 'node:crypto';
import { createReadingQuestions, findReadingQuestionsByIds } from '../repositories/reading-question-repo';

export interface ReadingQuestionDefinitionInput {
  questionType: string;
  dseType?: string | null;
  questionText: string;
  choices?: string[] | null;
  answer: string;
  marks: number;
  orderIndex: number;
}

export interface ReadingQuestionDefinition {
  id: string;
  questionType: string;
  dseType: string | null;
  questionText: string;
  choices: string[] | null;
  answer: string;
  marks: number;
  orderIndex: number;
}

/**
 * Persist generated questions and return the server-assigned canonical
 * ids in the same order as the input.
 */
export async function persistGeneratedReadingQuestions(
  questions: ReadingQuestionDefinitionInput[],
): Promise<string[]> {
  if (!questions || questions.length === 0) return [];
  const ids = questions.map(() => randomUUID());
  await createReadingQuestions(
    questions.map((q, i) => ({
      id: ids[i],
      questionType: q.questionType,
      dseType: q.dseType ?? null,
      questionText: q.questionText,
      choices: q.choices && q.choices.length > 0 ? JSON.stringify(q.choices) : null,
      answer: q.answer,
      marks: q.marks,
      orderIndex: q.orderIndex,
    })),
  );
  return ids;
}

/**
 * Resolve canonical definitions for a list of question ids.
 * Missing ids are simply absent from the map — callers must treat them
 * as NOT_PROJECTABLE (no reconstruction).
 */
export async function resolveReadingQuestionDefinitions(
  ids: string[],
): Promise<Map<string, ReadingQuestionDefinition>> {
  const map = new Map<string, ReadingQuestionDefinition>();
  const rows = await findReadingQuestionsByIds(ids);
  for (const r of rows) {
    let choices: string[] | null = null;
    if (r.choices) {
      try {
        const parsed = JSON.parse(r.choices) as unknown;
        if (Array.isArray(parsed)) choices = parsed.map(c => String(c));
      } catch {
        choices = null; // malformed JSON — treat as no choices
      }
    }
    map.set(r.id, {
      id: r.id,
      questionType: r.questionType,
      dseType: r.dseType,
      questionText: r.questionText,
      choices,
      answer: r.answer,
      marks: r.marks,
      orderIndex: r.orderIndex,
    });
  }
  return map;
}
