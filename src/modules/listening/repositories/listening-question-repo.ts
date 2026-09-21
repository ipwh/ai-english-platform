// ============================================
// 2026-09-21 ADR-045: Listening Question Repository
// ============================================
// Data access for the server-owned canonical listening question store.
// Mirrors the reading store: append-only content rows, resolved by id.
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

/** Persist generated question definitions (append-only content rows) */
export async function createListeningQuestions(data: Prisma.ListeningQuestionCreateManyInput[]): Promise<void> {
  if (!data || data.length === 0) return;
  await db.listeningQuestion.createMany({ data });
}

/**
 * Resolve canonical definitions by question id.
 * Missing ids are absent from the result — callers must treat them as
 * NOT_PROJECTABLE (never reconstruct a key).
 */
export async function findListeningQuestionsByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  return db.listeningQuestion.findMany({ where: { id: { in: ids } } });
}
