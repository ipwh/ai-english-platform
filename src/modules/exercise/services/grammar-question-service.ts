// ============================================
// R3.10-D: Grammar Question Service — server-owned definitions
// ============================================
// Question-definition authority (mirrors the reading model):
// - At generation time the server persists each grammar question's
//   canonical definition (answer key, choices, acceptedAnswers,
//   provenance) and assigns the persisted id as its identity.
// - Scoring NEVER consults client-supplied correctAnswer / choices /
//   questionPrompt. Unknown ids are NOT_PROJECTABLE (never rebuilt).
// ============================================

import { randomUUID } from 'node:crypto';
import { createGrammarQuestions, findGrammarQuestionsByIds } from '../repositories/grammar-question-repo';

export interface GrammarQuestionDefinitionInput {
  questionType: string;
  prompt: string;
  promptZh?: string | null;
  choices?: string[] | null;
  answer: string;
  acceptedAnswers?: string[] | null;
  grammarItem?: string | null;
  languageSkill?: string | null;
  difficulty: string;
  gradeLevel: string;
  explanationZh?: string | null;
  explanationEn?: string | null;
  provenance?: string;
}

export interface GrammarQuestionDefinition {
  id: string;
  questionType: string;
  prompt: string;
  promptZh: string | null;
  choices: string[] | null;
  answer: string;
  acceptedAnswers: string[] | null;
  grammarItem: string | null;
  languageSkill: string | null;
  difficulty: string;
  gradeLevel: string;
  provenance: string;
}

function parseStringArray(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(c => String(c));
  } catch {
    // malformed JSON — treat as absent
  }
  return null;
}

/**
 * Persist generated grammar questions BEFORE delivery and return the
 * server-assigned canonical ids in the same order as the input.
 */
export async function persistGeneratedGrammarQuestions(
  questions: GrammarQuestionDefinitionInput[],
): Promise<string[]> {
  if (!questions || questions.length === 0) return [];
  const ids = questions.map(() => randomUUID());
  const validatedAt = new Date();
  await createGrammarQuestions(
    questions.map((q, i) => ({
      id: ids[i],
      questionType: q.questionType,
      prompt: q.prompt,
      promptZh: q.promptZh ?? null,
      choices: q.choices && q.choices.length > 0 ? JSON.stringify(q.choices) : null,
      answer: q.answer,
      acceptedAnswers: q.acceptedAnswers && q.acceptedAnswers.length > 0 ? JSON.stringify(q.acceptedAnswers) : null,
      grammarItem: q.grammarItem ?? null,
      languageSkill: q.languageSkill ?? null,
      difficulty: q.difficulty,
      gradeLevel: q.gradeLevel,
      explanationZh: q.explanationZh ?? null,
      explanationEn: q.explanationEn ?? null,
      provenance: q.provenance || 'ai-generated',
      validatedAt,
    })),
  );
  return ids;
}

/**
 * Resolve canonical definitions for a list of question ids.
 * Missing ids are simply absent from the map — callers must treat them
 * as NOT_PROJECTABLE (no reconstruction).
 */
export async function resolveGrammarQuestionDefinitions(
  ids: string[],
): Promise<Map<string, GrammarQuestionDefinition>> {
  const map = new Map<string, GrammarQuestionDefinition>();
  const rows = await findGrammarQuestionsByIds(ids);
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      questionType: r.questionType,
      prompt: r.prompt,
      promptZh: r.promptZh,
      choices: parseStringArray(r.choices),
      answer: r.answer,
      acceptedAnswers: parseStringArray(r.acceptedAnswers),
      grammarItem: r.grammarItem,
      languageSkill: r.languageSkill,
      difficulty: r.difficulty,
      gradeLevel: r.gradeLevel,
      provenance: r.provenance,
    });
  }
  return map;
}

/**
 * Resolve post-grading explanations (zh/en) for many question ids at once.
 * Same contract as the single-id variant — explanations are only revealed
 * AFTER server-side grading. Batched so displays never issue N queries.
 */
export async function resolveGrammarQuestionExplanationsMany(
  ids: string[],
): Promise<Map<string, { explanationZh: string | null; explanationEn: string | null }>> {
  const map = new Map<string, { explanationZh: string | null; explanationEn: string | null }>();
  const unique = Array.from(new Set(ids.filter(id => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return map;

  const rows = await findGrammarQuestionsByIds(unique);
  for (const row of rows) {
    const r = row as { id: string; explanationZh?: string | null; explanationEn?: string | null };
    map.set(r.id, {
      explanationZh: r.explanationZh ?? null,
      explanationEn: r.explanationEn ?? null,
    });
  }
  return map;
}

/**
 * Resolve post-grading explanations (zh/en) for a question id.
 * Kept out of the canonical scoring definition — explanations are only
 * revealed AFTER server-side grading (2026-08-30 audit R8).
 */
export async function resolveGrammarQuestionExplanations(
  id: string,
): Promise<{ explanationZh: string | null; explanationEn: string | null } | null> {
  const map = await resolveGrammarQuestionExplanationsMany([id]);
  return map.get(id) ?? null;
}
