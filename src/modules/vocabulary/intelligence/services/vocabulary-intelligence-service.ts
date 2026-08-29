// Sprint 35: Vocabulary Intelligence Service — orchestrates repo + formula
import type { VocabularyProfile, VocabWordProfile } from '../types';
import { getStudentVocabWithSrsState } from '../repositories/vocabulary-intelligence-repo';
import { buildWordProfile, generateVocabRecommendations } from './vocabulary-formula';

/**
 * Build the full vocabulary profile for a student.
 */
export async function buildVocabProfile(studentId: string): Promise<VocabularyProfile> {
  const rawItems = await getStudentVocabWithSrsState(studentId);

  // Build word profiles
  const profiles: VocabWordProfile[] = rawItems.map(item =>
    buildWordProfile({
      word: item.word,
      partOfSpeech: item.partOfSpeech,
      meaningZh: item.meaningZh,
      familiarity: item.familiarity,
      masteryLevel: item.masteryLevel,
      daysSinceReview: item.daysSinceReview,
      dueForReview: item.dueForReview,
      frequency: item.reviewInterval > 0 ? Math.floor(365 / Math.max(item.reviewInterval, 1)) : 0,
      wordFamily: [...item.synonyms, ...item.antonyms].slice(0, 10),
      collocations: item.collocations,
      exampleSentences: item.exampleSentence ? [item.exampleSentence] : [],
      createdAt: item.createdAt,
    }),
  );

  // Group by status
  const byStatus = {
    known: 0, learning: 0, weak: 0, forgotten: 0, mastered: 0, 'need-review': 0,
  } as Record<string, number>;

  const known: VocabWordProfile[] = [];
  const learning: VocabWordProfile[] = [];
  const weak: VocabWordProfile[] = [];
  const forgotten: VocabWordProfile[] = [];
  const mastered: VocabWordProfile[] = [];
  const needReview: VocabWordProfile[] = [];

  for (const p of profiles) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    switch (p.status) {
      case 'known': known.push(p); break;
      case 'learning': learning.push(p); break;
      case 'weak': weak.push(p); break;
      case 'forgotten': forgotten.push(p); break;
      case 'mastered': mastered.push(p); break;
      case 'need-review': needReview.push(p); break;
    }
  }

  // Word families: group by root (simplified: first 3 chars)
  const familyMap = new Map<string, VocabWordProfile[]>();
  for (const p of profiles) {
    const root = p.word.slice(0, 3).toLowerCase();
    const existing = familyMap.get(root);
    if (existing) { existing.push(p); } else { familyMap.set(root, [p]); }
  }

  const wordFamilies = [...familyMap.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([root, members]) => ({
      root,
      members: members.map(m => m.word),
      averageMastery: Math.round(members.reduce((s, m) => s + m.masteryLevel, 0) / members.length * 10) / 10,
    }))
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 10);

  // Difficulty distribution
  const byDifficulty: Record<string, number> = {};
  for (const p of profiles) {
    byDifficulty[p.difficulty] = (byDifficulty[p.difficulty] ?? 0) + 1;
  }

  // Review queue: need-review + forgotten, sorted by priority
  const reviewQueue = [...needReview, ...forgotten]
    .sort((a, b) => {
      // Sort: higher priority = more overdue + lower mastery
      const aScore = a.daysSinceReview * (6 - a.masteryLevel);
      const bScore = b.daysSinceReview * (6 - b.masteryLevel);
      return bScore - aScore;
    })
    .slice(0, 10);

  // Generate recommendations
  const recommendations = generateVocabRecommendations({
    byStatus: byStatus as Record<'known' | 'learning' | 'weak' | 'forgotten' | 'mastered' | 'need-review', number>,
    totalWords: profiles.length,
    weak,
    forgotten,
    needReview,
  });

  return {
    studentId,
    totalWords: profiles.length,
    byStatus: byStatus as VocabularyProfile['byStatus'],
    known,
    learning,
    weak,
    forgotten,
    mastered,
    needReview,
    wordFamilies,
    byDifficulty,
    reviewQueue,
    recommendations,
    generatedAt: new Date(),
  };
}
