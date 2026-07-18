import { db } from '@/shared/db/db';
export async function listVocab(studentId: string) { return db.vocabItem.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }); }
export async function findVocabById(id: string) { return db.vocabItem.findUnique({ where: { id } }); }
export async function findVocabByWord(studentId: string, word: string) { return db.vocabItem.findFirst({ where: { studentId, word } }); }
export async function createVocab(data: any) { return db.vocabItem.create({ data }); }
export async function updateVocab(id: string, data: any) { return db.vocabItem.update({ where: { id }, data }); }
export async function deleteVocab(id: string) { return db.vocabItem.delete({ where: { id } }); }
export async function getDueVocabForReview(studentId: string, limit = 20) { return db.vocabItem.findMany({ where: { studentId, nextReviewDate: { lte: new Date() } }, orderBy: { nextReviewDate: 'asc' }, take: limit }); }
export async function countVocab(studentId: string) { return db.vocabItem.count({ where: { studentId } }); }
export async function getVocabStats(studentId: string) { const [total, mastered] = await Promise.all([db.vocabItem.count({ where: { studentId } }), db.vocabItem.count({ where: { studentId, familiarity: { in: ['familiar','mastered'] } } })]); return { total, mastered, learning: total - mastered }; }
