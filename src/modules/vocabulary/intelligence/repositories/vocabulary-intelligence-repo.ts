// Sprint 35: Vocabulary Intelligence Repository — read-only aggregator over existing VocabItem
import { db } from '@/shared/db/db';

/** Fetch all vocab items for a student with computed SRS state */
export async function getStudentVocabWithSrsState(studentId: string) {
  const items = await db.vocabItem.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const nowTime = now.getTime();
  const dayMs = 86400000;

  return items.map(item => {
    const lastReviewedAt = item.lastReviewedAt ? item.lastReviewedAt.getTime() : item.createdAt.getTime();
    const daysSinceReview = Math.floor((nowTime - lastReviewedAt) / dayMs);
    const dueForReview = item.nextReviewDate ? item.nextReviewDate <= now : false;

    // Parse JSON fields
    let synonyms: string[] = [];
    let antonyms: string[] = [];
    let collocations: string[] = [];
    try { synonyms = JSON.parse(item.synonyms ?? '[]'); } catch { /* keep empty */ }
    try { antonyms = JSON.parse(item.antonyms ?? '[]'); } catch { /* keep empty */ }
    try { collocations = JSON.parse(item.collocations ?? '[]'); } catch { /* keep empty */ }

    return {
      id: item.id,
      word: item.word,
      partOfSpeech: item.partOfSpeech,
      meaningZh: item.meaningZh,
      familiarity: item.familiarity,
      masteryLevel: item.masteryLevel,
      daysSinceReview,
      dueForReview,
      reviewInterval: item.reviewInterval,
      easeFactor: item.easeFactor,
      synonyms,
      antonyms,
      collocations,
      exampleSentence: item.exampleSentence,
      createdAt: item.createdAt,
    };
  });
}

/** Count vocab stats per familiarity */
export async function getVocabStats(studentId: string) {
  const items = await db.vocabItem.findMany({
    where: { studentId },
    select: { familiarity: true, masteryLevel: true, nextReviewDate: true },
  });

  const now = new Date();
  return {
    total: items.length,
    byFamiliarity: {
      new: items.filter(i => i.familiarity === 'new').length,
      learning: items.filter(i => i.familiarity === 'learning').length,
      familiar: items.filter(i => i.familiarity === 'familiar').length,
      mastered: items.filter(i => i.familiarity === 'mastered').length,
    },
    avgMastery: items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.masteryLevel, 0) / items.length * 10) / 10
      : 0,
    dueForReview: items.filter(i => i.nextReviewDate && i.nextReviewDate <= now).length,
  };
}
