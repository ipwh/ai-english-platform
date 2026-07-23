// Sprint 4: Vocabulary Service — word management, SRS, quiz orchestration
import {
  listVocab, findVocabById, findVocabByWord, createVocab, updateVocab, deleteVocab,
  countVocab, getDueVocabForReview, listVocabFiltered, countVocabFiltered, createMasteryLog
} from '@/modules/vocabulary/repositories/vocabulary-repo';
import { calculateNextReview } from '@/modules/vocabulary/services/srs';
import { logger } from '@/shared/logger/logger';
import type { Prisma } from '@prisma/client';

export interface VocabInput {
  studentId: string; word: string; translation: string;
  partOfSpeech?: string; example?: string; source?: string;
}

export async function addWord(input: VocabInput) {
  const existing = await findVocabByWord(input.studentId, input.word);
  if (existing) return existing;
  logger.info({ module: 'vocabulary-service', word: input.word, studentId: input.studentId }, 'Adding word');
  return createVocab({
    student: { connect: { id: input.studentId } },
    word: input.word,
    partOfSpeech: input.partOfSpeech || 'noun',
    meaningZh: input.translation,
    exampleSentence: input.example,
    familiarity: 'new',
  });
}

export async function getStudentWords(studentId: string) { return listVocab(studentId); }
export async function removeWord(id: string) { return deleteVocab(id); }
export async function getDueReviews(studentId: string, limit = 20) { return getDueVocabForReview(studentId, limit); }

export async function recordReview(vocabId: string, quality: number) {
  const srs = calculateNextReview(quality);
  return updateVocab(vocabId, {
    nextReviewDate: srs.nextReviewDate,
    easeFactor: srs.easeFactor,
    reviewInterval: srs.interval,
    lastReviewedAt: new Date(),
  });
}

export async function getVocabularyStats(studentId: string) {
  const total = await countVocab(studentId);
  const due = await getDueVocabForReview(studentId, 100);
  return { total, dueCount: due.length };
}

export async function getWordById(id: string) { return findVocabById(id); }

// ============================================
// v5: Extended service methods for route migration
// ============================================

export interface VocabListFilters {
  familiarity?: string;
  pos?: string;
  search?: string;
  sort?: 'recent' | 'alpha' | 'mastery';
}

export interface VocabListResult {
  vocab: Awaited<ReturnType<typeof listVocab>>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function listVocabPaginated(
  studentId: string,
  page: number,
  limit: number,
  filters: VocabListFilters = {},
): Promise<VocabListResult> {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = { studentId };
  if (filters.familiarity && filters.familiarity !== 'all') where.familiarity = filters.familiarity;
  if (filters.pos) where.partOfSpeech = filters.pos;
  if (filters.search) where.word = { contains: filters.search, mode: 'insensitive' };

  const orderBy: Record<string, string> =
    filters.sort === 'alpha' ? { word: 'asc' } :
    filters.sort === 'mastery' ? { masteryLevel: 'desc' } :
    { createdAt: 'desc' };

  const [vocab, total] = await Promise.all([
    listVocabFiltered({ where, orderBy, skip, take: limit }),
    countVocabFiltered(where),
  ]);

  return { vocab, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export interface VocabUpdateInput {
  familiarity?: string;
  masteryLevel?: number;
  nextReviewDate?: string;
  reviewInterval?: number;
  easeFactor?: number;
  lastReviewedAt?: string;
}

export async function updateVocabWord(
  id: string,
  userId: string,
  userRole: string,
  data: VocabUpdateInput,
) {
  const prev = await findVocabById(id);
  if (!prev) return { error: 'NOT_FOUND' } as const;
  if (prev.studentId !== userId && userRole !== 'teacher' && userRole !== 'admin') {
    return { error: 'FORBIDDEN' } as const;
  }

  const updateData: Prisma.VocabItemUpdateInput = {};
  if (data.familiarity && ['new', 'learning', 'familiar', 'mastered'].includes(data.familiarity)) {
    updateData.familiarity = data.familiarity;
  }
  if (typeof data.masteryLevel === 'number' && data.masteryLevel >= 0 && data.masteryLevel <= 5) {
    updateData.masteryLevel = data.masteryLevel;
  }
  if (data.nextReviewDate) updateData.nextReviewDate = new Date(data.nextReviewDate);
  if (data.reviewInterval !== undefined) updateData.reviewInterval = data.reviewInterval;
  if (data.easeFactor !== undefined) updateData.easeFactor = data.easeFactor;
  if (data.lastReviewedAt) updateData.lastReviewedAt = new Date(data.lastReviewedAt);

  if (Object.keys(updateData).length === 0) return { error: 'NO_FIELDS' } as const;

  const vocab = await updateVocab(id, updateData);

  // Log mastery changes
  const newFamiliarity = data.familiarity || prev.familiarity;
  const newMastery = data.masteryLevel !== undefined ? data.masteryLevel : prev.masteryLevel;
  if (prev.familiarity !== newFamiliarity || prev.masteryLevel !== newMastery) {
    try {
      await createMasteryLog({
        vocabId: id,
        studentId: prev.studentId,
        fromLevel: prev.familiarity,
        toLevel: newFamiliarity,
        fromMastery: prev.masteryLevel,
        toMastery: newMastery,
      });
    } catch { /* non-fatal */ }
  }

  return { error: null, vocab };
}

export async function deleteVocabWord(
  id: string,
  userId: string,
  userRole: string,
) {
  const existing = await findVocabById(id);
  if (!existing) return { error: 'NOT_FOUND' } as const;
  if (existing.studentId !== userId && userRole !== 'teacher' && userRole !== 'admin') {
    return { error: 'FORBIDDEN' } as const;
  }
  await deleteVocab(id);
  return { error: null };
}

// ============================================
// v5: Spelling & quiz support
// ============================================

export async function getVocabForSpelling(
  studentId: string,
  count: number,
  mode: string,
  wordIds?: string,
) {
  let orderBy: Record<string, string>;
  let whereExtra: Record<string, unknown> = {};

  switch (mode) {
    case 'weakest': orderBy = { masteryLevel: 'asc' }; break;
    case 'new': orderBy = { createdAt: 'desc' }; break;
    case 'due': orderBy = { masteryLevel: 'asc' }; whereExtra = { nextReviewDate: { lte: new Date() } }; break;
    default: orderBy = { createdAt: 'desc' };
  }

  if (wordIds) {
    const ids = wordIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length > 0) whereExtra = { id: { in: ids } };
  }

  let items = await listVocabFiltered({
    where: { studentId, ...whereExtra },
    orderBy,
    skip: 0,
    take: wordIds ? (wordIds.split(',').length || 30) : (mode === 'random' ? 100 : count * 2),
  });

  if (mode === 'random' && !wordIds) {
    items = items.sort(() => Math.random() - 0.5).slice(0, count);
  } else {
    items = items.slice(0, count);
  }

  return items;
}

export async function createSpellingSession(studentId: string, totalWords: number) {
  const { db } = await import('@/shared/db/db');
  return db.spellingSession.create({
    data: { studentId, totalWords, correctCount: 0, status: 'in-progress' },
  });
}

export async function getExistingWordSet(studentId: string): Promise<Set<string>> {
  const items = await listVocab(studentId);
  return new Set(items.map(v => v.word.toLowerCase()));
}

export async function getVocabForExport(studentId: string, wordIds?: string[]) {
  if (wordIds && wordIds.length > 0) {
    return listVocabFiltered({
      where: { id: { in: wordIds }, studentId },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: wordIds.length,
    });
  }
  return listVocabFiltered({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    skip: 0,
    take: 100,
  });
}

// ============================================
// v5: Spelling session support
// ============================================

export async function createSpellingAttempt(data: {
  sessionId: string; vocabId: string | null; word: string;
  meaningZh: string; explanationEn?: string | null;
  studentInput: string; isCorrect: boolean; attempts?: number;
}) {
  const { db } = await import('@/shared/db/db');
  return db.spellingAttempt.create({ data });
}

export async function updateVocabSRS(vocabId: string, data: {
  masteryLevel: number; reviewInterval: number;
  nextReviewDate: Date; lastReviewedAt: Date; familiarity: string;
}) {
  return updateVocab(vocabId, data);
}

export async function completeSpellingSession(sessionId: string, correctCount: number) {
  const { db } = await import('@/shared/db/db');
  return db.spellingSession.update({
    where: { id: sessionId },
    data: { correctCount, status: 'completed', completedAt: new Date() },
  });
}
