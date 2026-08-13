// ============================================
// R3.10-D: Grammar Question Repository
// ============================================
// Data access for the server-owned canonical grammar question store.
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

/** Persist generated question definitions (append-only content rows) */
export async function createGrammarQuestions(data: Prisma.GrammarQuestionCreateManyInput[]): Promise<void> {
  if (!data || data.length === 0) return;
  await db.grammarQuestion.createMany({ data });
}

/** Resolve canonical definitions by question id */
export async function findGrammarQuestionsByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  return db.grammarQuestion.findMany({ where: { id: { in: ids } } });
}
