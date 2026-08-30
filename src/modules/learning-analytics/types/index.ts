// Sprint 37: Learning Analytics — type definitions

export type TrendDirection = 'up' | 'down' | 'stable';

export interface TrendPoint {
  date: string;       // ISO date
  value: number;      // 0-100
  label?: string;
}

export interface StudentTrends {
  studentId: string;
  /** Overall learning trend (weekly accuracy) */
  learningTrend: TrendPoint[];
  /** Mastery trend per skill */
  masteryTrend: Record<string, TrendPoint[]>;
  /** Writing score trend */
  writingTrend: TrendPoint[];
  /** Vocabulary growth trend */
  vocabularyTrend: TrendPoint[];
  /** Grammar accuracy trend */
  grammarTrend: TrendPoint[];
  /** Overall direction */
  overallDirection: TrendDirection;
  generatedAt: Date;
}

export interface LearningStats {
  studentId: string;
  totalPractices: number;
  totalMistakes: number;
  totalVocabulary: number;
  overallMastery: number;
  streak: number;
  generatedAt: Date;
}
