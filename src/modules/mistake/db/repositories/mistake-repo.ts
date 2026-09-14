// ============================================
// Mistake Repository — centralized data access for mistake records
// P1: Repository Layer Migration
// ============================================

import { db } from '@/shared/db/db';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export type MistakeRecord = Awaited<ReturnType<typeof db.mistake.findFirst>>;

export interface MistakeSkillFields {
  languageSkill?: string | null;
  grammarItem?: string | null;
  questionType?: string | null;
  skillSource?: string | null;
}

/** Create a new mistake record */
export async function createMistake(data: {
  studentId: string;
  questionId: string;
  studentAnswer: string;
  correctAnswer: string;
  mistakeType?: string;
  aiExplanation?: string;
  questionSummary?: string;
} & MistakeSkillFields) {
  return db.mistake.create({
    data: {
      studentId: data.studentId,
      questionId: data.questionId,
      studentAnswer: data.studentAnswer,
      correctAnswer: data.correctAnswer,
      mistakeType: data.mistakeType || 'grammar',
      aiExplanation: data.aiExplanation,
      questionSummary: data.questionSummary,
      ...toSkillColumns(data),
    },
  });
}

/**
 * Map optional skill identity onto the persisted columns.
 * Absent keys stay undefined so Prisma leaves the column untouched / NULL.
 */
function toSkillColumns(data: MistakeSkillFields) {
  return {
    languageSkill: data.languageSkill ?? null,
    grammarItem: data.grammarItem ?? null,
    questionType: data.questionType ?? null,
    skillSource: data.skillSource ?? null,
  };
}

/**
 * R3.10-E.2 P0-2: atomic insert-if-absent.
 *
 * Replaces the TOCTOU find-then-create pattern. A single INSERT ...
 * ON CONFLICT DO NOTHING statement guarantees at most ONE Mistake row
 * per (studentId, questionId) even under concurrent submissions.
 * Returns { inserted: true } when a new row was written, else
 * { inserted: false } (an existing row already covered this question —
 * nothing is modified; canonical record preserved).
 */
export async function createMistakeIfAbsent(data: {
  studentId: string;
  questionId: string;
  studentAnswer: string;
  correctAnswer: string;
  mistakeType?: string;
  aiExplanation?: string;
  questionSummary?: string;
} & MistakeSkillFields): Promise<{ inserted: boolean }> {
  const result = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Mistake" (
      "id", "studentId", "questionId", "questionSummary",
      "studentAnswer", "correctAnswer", "mistakeType", "aiExplanation",
      "languageSkill", "grammarItem", "questionType", "skillSource",
      "reviewed", "inReviewList", "reviewInterval", "easeFactor", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${data.studentId}, ${data.questionId}, ${data.questionSummary || ''},
      ${data.studentAnswer}, ${data.correctAnswer}, ${data.mistakeType || 'grammar'}, ${data.aiExplanation ?? null},
      ${data.languageSkill ?? null}, ${data.grammarItem ?? null}, ${data.questionType ?? null}, ${data.skillSource ?? null},
      false, false, 0, 2.5, ${new Date()}
    )
    ON CONFLICT ("studentId", "questionId") DO NOTHING
    RETURNING "id"
  `;
  return { inserted: Array.isArray(result) && result.length > 0 };
}

/** List mistakes for a student, ordered by most recent */
export async function listMistakes(studentId: string, limit = 100) {
  return db.mistake.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** List mistakes by type for a student */
export async function listMistakesByType(studentId: string, mistakeType: string, limit = 50) {
  return db.mistake.findMany({
    where: { studentId, mistakeType },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * 2026-09-14: SRS 每日複習候選清單。
 *
 * 只有「可重考」的錯題才適合當 flashcard：閱讀／聆聽題目依附一篇 passage，
 * 重看卡片既不能重考、又擠佔每日目標 → 一律排除。
 *
 * 排除條件刻意寫得明確（不用 `NOT: { languageSkill: { in: [...] } }`）：
 * SQL 的 `NULL NOT IN (...)` 結果是 NULL，會令歷史列（languageSkill 為 null）
 * 被靜默排除。這裡改為顯式的兩條規則：
 *   1. 技能標記為 reading / listening → 篇章題目
 *   2. mistakeType = comprehension → 閱讀／聆聽類（連歷史列也涵蓋）
 * 到期條件：從未排程（nextReviewDate 為 null）或已到期。
 */
export async function listDueMistakesForReview(studentId: string, limit = 50) {
  return db.mistake.findMany({
    where: {
      studentId,
      NOT: { mistakeType: 'comprehension' },
      AND: [
        { OR: [{ languageSkill: null }, { languageSkill: { notIn: ['reading', 'listening'] } }] },
        { OR: [{ nextReviewDate: null }, { nextReviewDate: { lte: new Date() } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Bulk update mistakes (mark reviewed, add to review list) */
export async function bulkUpdateMistakes(where: Record<string, unknown>, data: Record<string, unknown>) {
  return db.mistake.updateMany({ where, data });
}

/** Bulk delete mistakes */
export async function bulkDeleteMistakes(where: Record<string, unknown>) {
  return db.mistake.deleteMany({ where });
}

/** Find a single mistake by ID */
export async function findMistakeById(id: string) {
  return db.mistake.findUnique({ where: { id } });
}

/** Find an existing mistake by questionId + studentId (for dedup) */
export async function findMistakeByQuestion(studentId: string, questionId: string) {
  return db.mistake.findFirst({ where: { questionId, studentId } });
}

/** Update a mistake record */
export async function updateMistake(id: string, data: Prisma.MistakeUpdateInput) {
  return db.mistake.update({ where: { id }, data });
}

/** Delete a mistake record */
export async function deleteMistake(id: string) {
  return db.mistake.delete({ where: { id } });
}

/** Get mistakes due for SRS review */
export async function getDueForReview(studentId: string) {
  const now = new Date();
  return db.mistake.findMany({
    where: {
      studentId,
      inReviewList: true,
      nextReviewDate: { lte: now },
    },
    orderBy: { nextReviewDate: 'asc' },
    take: 20,
  });
}

/** Count mistakes for a student */
export async function countMistakes(studentId: string) {
  return db.mistake.count({ where: { studentId } });
}
