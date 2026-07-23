// Sprint 35: Vocabulary Intelligence — type definitions

export type VocabStatus = 'known' | 'learning' | 'weak' | 'forgotten' | 'mastered' | 'need-review';

export interface VocabWordProfile {
  word: string;
  partOfSpeech: string;
  meaningZh: string;
  /** Computed status from familiarity + mastery + SRS */
  status: VocabStatus;
  familiarity: string;
  masteryLevel: number;        // 0-5
  /** Days since last review */
  daysSinceReview: number;
  /** Is overdue for SRS review */
  dueForReview: boolean;
  /** CEFR difficulty level */
  difficulty: string;          // A1-C2
  /** Practice frequency (total reviews) */
  frequency: number;
  /** Word family members */
  wordFamily: string[];
  /** Known collocations */
  collocations: string[];
  /** Example sentences */
  exampleSentences: string[];
  createdAt: Date;
}

export interface VocabularyProfile {
  studentId: string;
  totalWords: number;
  /** Breakdown by status */
  byStatus: Record<VocabStatus, number>;
  /** Words grouped by status */
  known: VocabWordProfile[];
  learning: VocabWordProfile[];
  weak: VocabWordProfile[];
  forgotten: VocabWordProfile[];
  mastered: VocabWordProfile[];
  needReview: VocabWordProfile[];
  /** Top word families */
  wordFamilies: Array<{
    root: string;
    members: string[];
    averageMastery: number;
  }>;
  /** Difficulty distribution */
  byDifficulty: Record<string, number>;
  /** Personalized review queue (top 10) */
  reviewQueue: VocabWordProfile[];
  /** Recommendations */
  recommendations: string[];
  generatedAt: Date;
}

export interface VocabReviewItem {
  word: string;
  meaningZh: string;
  partOfSpeech: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  daysOverdue: number;
  currentMastery: number;
}
