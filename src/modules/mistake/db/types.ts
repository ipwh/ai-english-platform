// Sprint 9: Mistake Database — types

export type MistakeCategory = 'grammar' | 'vocabulary' | 'comprehension' | 'careless' | 'time-management' | 'chinglish';
export type MistakeSeverity = 'critical' | 'major' | 'minor';

export interface MistakeRecord {
  id: string;
  studentId: string;
  questionId: string;
  questionSummary: string;
  studentAnswer: string;
  correctAnswer: string;
  category: MistakeCategory;
  aiExplanation?: string;
  reviewed: boolean;
  nextReviewDate?: Date;
  createdAt: Date;
}

export interface MistakeStats {
  totalMistakes: number;
  reviewedCount: number;
  pendingReviewCount: number;
  /** Mistakes per category */
  byCategory: Record<MistakeCategory, CategoryStats>;
  /** Most frequent mistake grammar points */
  topGrammarPoints: GrammarPointStat[];
  /** Most frequent mistake vocabulary */
  topVocabWords: VocabWordStat[];
  /** Mistakes in last 7/30 days */
  recent7Days: number;
  recent30Days: number;
  /** Average mistakes per practice session */
  mistakesPerSession: number;
}

export interface CategoryStats {
  count: number;
  percentage: number;
  severity: MistakeSeverity;
  /** Review completion rate for this category */
  reviewRate: number;
}

export interface GrammarPointStat {
  grammarPoint: string;
  count: number;
  lastSeen: Date;
  /** Average days between mistakes (lower = more frequent) */
  avgIntervalDays: number;
}

export interface VocabWordStat {
  word: string;
  count: number;
  lastSeen: Date;
  partOfSpeech?: string;
}

export interface MistakeRecommendation {
  type: 'review' | 'practice' | 'lesson';
  priority: 'high' | 'medium' | 'low';
  category: MistakeCategory;
  target: string;           // grammar point name, vocab word, etc.
  targetZh: string;
  reason: string;
  mistakeCount: number;
  /** Recommended number of practice questions */
  practiceCount: number;
}
