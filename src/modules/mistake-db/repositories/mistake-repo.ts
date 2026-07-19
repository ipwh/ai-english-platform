// ============================================
// Mistake Repository — centralized data access for mistake records
// P1: Repository Layer Migration
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export type MistakeRecord = Awaited<ReturnType<typeof db.mistake.findFirst>>;

/** Create a new mistake record */
export async function createMistake(data: {
  studentId: string;
  questionId: string;
  studentAnswer: string;
  correctAnswer: string;
  mistakeType?: string;
  aiExplanation?: string;
  questionSummary?: string;
}) {
  return db.mistake.create({
    data: {
      studentId: data.studentId,
      questionId: data.questionId,
      studentAnswer: data.studentAnswer,
      correctAnswer: data.correctAnswer,
      mistakeType: data.mistakeType || 'grammar',
      aiExplanation: data.aiExplanation,
      questionSummary: data.questionSummary,
    },
  });
}

/** List mistakes for a student, ordered by most recent */
export async function listMistakes(studentId: string, limit = 100) {
  return db.mistake.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
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

/** Bulk update mistake review status (mark multiple as reviewed) */
export async function bulkUpdateMistakes(ids: string[], data: Prisma.MistakeUpdateInput) {
  return db.mistake.updateMany({ where: { id: { in: ids } }, data });
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
