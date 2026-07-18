// Sprint 4: Vocabulary Service — word management, SRS, quiz orchestration
import {
  listVocab, findVocabById, findVocabByWord, createVocab, updateVocab, deleteVocab,
  countVocab, getDueVocabForReview
} from '@/modules/vocabulary/repositories/vocabulary-repo';
import { calculateNextReview } from '@/modules/vocabulary/services/srs';
import { logger } from '@/shared/logger/logger';

export interface VocabInput {
  studentId: string; word: string; translation: string;
  partOfSpeech?: string; example?: string; source?: string;
}

export async function addWord(input: VocabInput) {
  const existing = await findVocabByWord(input.studentId, input.word);
  if (existing) return existing;
  logger.info({ module: 'vocabulary-service', word: input.word, studentId: input.studentId }, 'Adding word');
  return createVocab({
    studentId: input.studentId, word: input.word, translation: input.translation,
    partOfSpeech: input.partOfSpeech, example: input.example,
    source: input.source, familiarity: 'new',
  } as any);
}

export async function getStudentWords(studentId: string) { return listVocab(studentId); }
export async function removeWord(id: string) { return deleteVocab(id); }
export async function getDueReviews(studentId: string, limit = 20) { return getDueVocabForReview(studentId, limit); }

export async function recordReview(vocabId: string, quality: number) {
  const srs = calculateNextReview(quality);
  return updateVocab(vocabId, {
    nextReviewDate: srs.nextReviewDate, easeFactor: srs.easeFactor,
    interval: srs.interval, repetitions: srs.repetitions,
    lastReviewedAt: new Date(), reviewCount: { increment: 1 },
  } as any);
}

export async function getVocabularyStats(studentId: string) {
  const total = await countVocab(studentId);
  const due = await getDueVocabForReview(studentId, 100);
  return { total, dueCount: due.length };
}

export async function getWordById(id: string) { return findVocabById(id); }
