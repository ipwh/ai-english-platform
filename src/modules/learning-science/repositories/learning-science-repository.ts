// Sprint 33: Learning Science Repository — DB persistence for review schedules
// ⚠️ TECH DEBT (Sprint 42): This repository violates Rule #5.
// Learning Science should contain only algorithms.
// Migrate to learning-memory/repositories/ and update consumers to go through LearningFacade.
import { db } from '@/shared/db/db';
import type { ReviewScheduleEntry } from '../types';

// ============================================
// Repository — CRUD for LearningReviewSchedule
// ============================================

function toDb(entry: ReviewScheduleEntry) {
  return {
    studentId: entry.studentId,
    itemId: entry.itemId,
    itemType: entry.itemType,
    skillDimension: entry.skillDimension || null,
    title: entry.title || null,
    titleZh: entry.titleZh || null,
    interval: entry.interval,
    easeFactor: entry.easeFactor,
    repetitions: entry.repetitions,
    lapses: entry.lapses,
    quality: entry.quality,
    estimatedMastery: entry.estimatedMastery,
    masteryConfidence: entry.masteryConfidence,
    evidenceCount: entry.evidenceCount,
    isMastered: entry.isMastered,
    currentDifficulty: entry.currentDifficulty,
    difficultyAdjustment: entry.difficultyAdjustment,
    adaptiveFactor: entry.adaptiveFactor,
    retrievalStrength: entry.retrievalStrength,
    timesCorrect: entry.timesCorrect,
    timesIncorrect: entry.timesIncorrect,
    reviewStrength: entry.reviewStrength,
    retentionProbability: entry.retentionProbability,
    lastReflection: entry.lastReflection || null,
    reflectionNotes: entry.reflectionNotes || null,
    lastReviewedAt: entry.lastReviewedAt ? new Date(entry.lastReviewedAt) : null,
    nextReviewAt: new Date(entry.nextReviewAt),
    reviewPriority: entry.reviewPriority,
    reviewUrgency: entry.reviewUrgency,
    recommendationReason: entry.recommendationReason || null,
    recommendationReasonZh: entry.recommendationReasonZh || null,
    recommendedStrategy: entry.recommendedStrategy || null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): ReviewScheduleEntry {
  return {
    id: row.id,
    studentId: row.studentId,
    itemId: row.itemId,
    itemType: row.itemType,
    skillDimension: row.skillDimension,
    title: row.title,
    titleZh: row.titleZh,
    interval: row.interval,
    easeFactor: row.easeFactor,
    repetitions: row.repetitions,
    lapses: row.lapses,
    quality: row.quality,
    estimatedMastery: row.estimatedMastery,
    masteryConfidence: row.masteryConfidence,
    evidenceCount: row.evidenceCount,
    isMastered: row.isMastered,
    currentDifficulty: row.currentDifficulty,
    difficultyAdjustment: row.difficultyAdjustment,
    adaptiveFactor: row.adaptiveFactor,
    retrievalStrength: row.retrievalStrength,
    timesCorrect: row.timesCorrect,
    timesIncorrect: row.timesIncorrect,
    reviewStrength: row.reviewStrength,
    retentionProbability: row.retentionProbability,
    lastReflection: row.lastReflection,
    reflectionNotes: row.reflectionNotes,
    lastReviewedAt: row.lastReviewedAt?.toISOString(),
    nextReviewAt: row.nextReviewAt instanceof Date ? row.nextReviewAt.toISOString() : String(row.nextReviewAt),
    reviewPriority: row.reviewPriority,
    reviewUrgency: row.reviewUrgency,
    recommendationReason: row.recommendationReason,
    recommendationReasonZh: row.recommendationReasonZh,
    recommendedStrategy: row.recommendedStrategy,
  };
}

export const learningScienceRepo = {
  async upsert(entry: ReviewScheduleEntry): Promise<ReviewScheduleEntry> {
    const row = await db.learningReviewSchedule.upsert({
      where: { studentId_itemId: { studentId: entry.studentId, itemId: entry.itemId } },
      create: toDb(entry),
      update: toDb(entry),
    });
    return fromDb(row);
  },

  async upsertMany(entries: ReviewScheduleEntry[]): Promise<ReviewScheduleEntry[]> {
    const results: ReviewScheduleEntry[] = [];
    for (const entry of entries) {
      results.push(await this.upsert(entry));
    }
    return results;
  },

  async getByStudentId(studentId: string): Promise<ReviewScheduleEntry[]> {
    const rows = await db.learningReviewSchedule.findMany({
      where: { studentId },
      orderBy: { nextReviewAt: 'asc' },
    });
    return rows.map(fromDb);
  },

  async getDueForReview(studentId: string): Promise<ReviewScheduleEntry[]> {
    const rows = await db.learningReviewSchedule.findMany({
      where: {
        studentId,
        nextReviewAt: { lte: new Date() },
        isMastered: false,
      },
      orderBy: { reviewPriority: 'desc' },
    });
    return rows.map(fromDb);
  },

  async getByItemId(studentId: string, itemId: string): Promise<ReviewScheduleEntry | null> {
    const row = await db.learningReviewSchedule.findUnique({
      where: { studentId_itemId: { studentId, itemId } },
    });
    return row ? fromDb(row) : null;
  },

  async getByItemType(studentId: string, itemType: string): Promise<ReviewScheduleEntry[]> {
    const rows = await db.learningReviewSchedule.findMany({
      where: { studentId, itemType },
      orderBy: { nextReviewAt: 'asc' },
    });
    return rows.map(fromDb);
  },

  async getMasteredItems(studentId: string): Promise<ReviewScheduleEntry[]> {
    const rows = await db.learningReviewSchedule.findMany({
      where: { studentId, isMastered: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(fromDb);
  },

  async deleteEntry(studentId: string, itemId: string): Promise<void> {
    await db.learningReviewSchedule.deleteMany({ where: { studentId, itemId } });
  },

  async countByStudent(studentId: string): Promise<{ total: number; mastered: number; due: number }> {
    const [total, mastered, due] = await Promise.all([
      db.learningReviewSchedule.count({ where: { studentId } }),
      db.learningReviewSchedule.count({ where: { studentId, isMastered: true } }),
      db.learningReviewSchedule.count({
        where: { studentId, nextReviewAt: { lte: new Date() }, isMastered: false },
      }),
    ]);
    return { total, mastered, due };
  },
};
