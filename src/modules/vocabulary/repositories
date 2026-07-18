// ============================================
// Vocabulary Repository — centralized data access for VocabItem operations
// Created Sprint 0.5: basic CRUD operations
// ============================================

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface VocabFilters {
  studentId: string;
  search?: string;
  familiarity?: string;
  partOfSpeech?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// Queries
// ============================================

export async function findVocabById(id: string) {
  return db.vocabItem.findUnique({ where: { id } });
}

export async function listVocab(filters: VocabFilters) {
  const where: Prisma.VocabItemWhereInput = { studentId: filters.studentId };

  if (filters.search) {
    where.OR = [
      { word: { contains: filters.search, mode: 'insensitive' } },
      { meaningZh: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.familiarity !== undefined) where.familiarity = filters.familiarity;
  if (filters.partOfSpeech) where.partOfSpeech = filters.partOfSpeech;

  const [items, total] = await Promise.all([
    db.vocabItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    }),
    db.vocabItem.count({ where }),
  ]);

  return { items, total };
}

export async function getDueVocabForReview(studentId: string, limit = 20) {
  return db.vocabItem.findMany({
    where: {
      studentId,
      nextReviewDate: { lte: new Date() },
    },
    orderBy: { nextReviewDate: 'asc' },
    take: limit,
  });
}

export async function getVocabStats(studentId: string) {
  const [total, mastered, learning] = await Promise.all([
    db.vocabItem.count({ where: { studentId } }),
    db.vocabItem.count({ where: { studentId, familiarity: { in: ['familiar', 'mastered'] } } }),
    db.vocabItem.count({ where: { studentId, familiarity: 'new' } }),
  ]);

  return { total, mastered, learning };
}

// ============================================
// Mutations
// ============================================

export async function createVocab(data: Prisma.VocabItemCreateInput) {
  return db.vocabItem.create({ data });
}

export async function updateVocab(id: string, data: Prisma.VocabItemUpdateInput) {
  return db.vocabItem.update({ where: { id }, data });
}

export async function deleteVocab(id: string) {
  return db.vocabItem.delete({ where: { id } });
}

export async function bulkCreateVocab(items: Prisma.VocabItemCreateManyInput[]) {
  return db.vocabItem.createMany({ data: items, skipDuplicates: true });
}
