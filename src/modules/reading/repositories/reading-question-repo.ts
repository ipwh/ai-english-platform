// ============================================
// R3.7: Reading Question Repository
// ============================================
// Data access for the server-owned canonical reading question store.
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

/** Persist generated question definitions (append-only content rows) */
export async function createReadingQuestions(data: Prisma.ReadingQuestionCreateManyInput[]): Promise<void> {
  if (!data || data.length === 0) return;
  await db.readingQuestion.createMany({ data });
}

/** Resolve canonical definitions by question id */
export async function findReadingQuestionsByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  return db.readingQuestion.findMany({ where: { id: { in: ids } } });
}
