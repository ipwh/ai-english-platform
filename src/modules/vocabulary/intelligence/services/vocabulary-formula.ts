// Sprint 35: Pure vocabulary intelligence formulas — no DB dependencies
import type { VocabStatus, VocabWordProfile } from '../types';

// ============================================
// Status Computation
// ============================================

/**
 * Compute vocabulary status from familiarity + mastery level + SRS state.
 *
 * Rules:
 * - masteryLevel >= 5 AND familiarity 'mastered' → mastered
 * - familiarity 'mastered' OR masteryLevel >= 4 → known
 * - familiarity 'learning' → learning
 * - masteryLevel <= 1 AND daysSinceReview > 30 → forgotten
 * - masteryLevel <= 2 → weak
 * - dueForReview (overdue SRS) → need-review (overrides others)
 */
export function computeVocabStatus(params: {
  familiarity: string;
  masteryLevel: number;
  daysSinceReview: number;
  dueForReview: boolean;
}): VocabStatus {
  const { familiarity, masteryLevel, daysSinceReview, dueForReview } = params;

  // Overdue SRS takes highest priority
  if (dueForReview) return 'need-review';

  // Mastered
  if (masteryLevel >= 5 && familiarity === 'mastered') return 'mastered';

  // Well-known
  if (familiarity === 'mastered' || masteryLevel >= 4) return 'known';

  // Forgotten: low mastery + long gap
  if (masteryLevel <= 1 && daysSinceReview > 30) return 'forgotten';

  // Active learning (check before weak)
  if (familiarity === 'learning') return 'learning';

  // Weak
  if (masteryLevel <= 2) return 'weak';

  return 'learning';
}

/**
 * Compute CEFR difficulty from part of speech + word length + heuristic.
 */
export function estimateDifficulty(params: {
  partOfSpeech: string;
  wordLength: number;
  masteryLevel: number;
}): string {
  const { partOfSpeech, wordLength } = params;

  // Very short function words → A1
  if (wordLength <= 3 && ['article', 'preposition', 'conjunction'].includes(partOfSpeech.toLowerCase())) {
    return 'A1';
  }

  // Short common words → A1-A2
  if (wordLength <= 5) return 'A2';

  // Medium words → B1
  if (wordLength <= 8) return 'B1';

  // Longer words → B2
  if (wordLength <= 11) return 'B2';

  // Very long / specialized → C1
  return 'C1';
}

/**
 * Build a VocabWordProfile from raw data.
 */
export function buildWordProfile(params: {
  word: string;
  partOfSpeech: string;
  meaningZh: string;
  familiarity: string;
  masteryLevel: number;
  daysSinceReview: number;
  dueForReview: boolean;
  frequency: number;
  wordFamily: string[];
  collocations: string[];
  exampleSentences: string[];
  createdAt: Date;
}): VocabWordProfile {
  const status = computeVocabStatus({
    familiarity: params.familiarity,
    masteryLevel: params.masteryLevel,
    daysSinceReview: params.daysSinceReview,
    dueForReview: params.dueForReview,
  });

  const difficulty = estimateDifficulty({
    partOfSpeech: params.partOfSpeech,
    wordLength: params.word.length,
    masteryLevel: params.masteryLevel,
  });

  return {
    word: params.word,
    partOfSpeech: params.partOfSpeech,
    meaningZh: params.meaningZh,
    status,
    familiarity: params.familiarity,
    masteryLevel: params.masteryLevel,
    daysSinceReview: params.daysSinceReview,
    dueForReview: params.dueForReview,
    difficulty,
    frequency: params.frequency,
    wordFamily: params.wordFamily,
    collocations: params.collocations,
    exampleSentences: params.exampleSentences,
    createdAt: params.createdAt,
  };
}

/**
 * Generate personalized recommendations from a vocabulary profile.
 */
export function generateVocabRecommendations(profile: {
  byStatus: Record<VocabStatus, number>;
  totalWords: number;
  weak: VocabWordProfile[];
  forgotten: VocabWordProfile[];
  needReview: VocabWordProfile[];
}): string[] {
  const recs: string[] = [];

  if (profile.needReview.length > 0) {
    recs.push(`你有 ${profile.needReview.length} 個單字需要複習（SRS 到期）`);
  }

  if (profile.forgotten.length > 0) {
    const top = profile.forgotten.slice(0, 3).map(w => w.word).join('、');
    recs.push(`已遺忘 ${profile.forgotten.length} 個單字，建議重溫：${top}`);
  }

  if (profile.weak.length > 0) {
    recs.push(`有 ${profile.weak.length} 個弱點單字需要加強練習`);
  }

  if (profile.totalWords === 0) {
    recs.push('尚未建立詞彙庫，建議開始加入新單字');
  }

  const masteredRatio = (profile.byStatus.mastered ?? 0) / Math.max(profile.totalWords, 1);
  if (masteredRatio > 0.5) {
    recs.push(`已掌握 ${Math.round(masteredRatio * 100)}% 詞彙，繼續保持！`);
  }

  return recs;
}
