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

export interface TeacherDashboard {
  teacherId: string;
  classId?: string;
  /** Class-wide weak skills (bottom 5) */
  weakSkills: Array<{ skill: string; avgMastery: number; studentCount: number }>;
  /** Class-wide strong skills (top 5) */
  strongSkills: Array<{ skill: string; avgMastery: number; studentCount: number }>;
  /** Class comparison: per-skill averages */
  classComparison: Record<string, { classAvg: number; gradeAvg: number }>;
  /** Progress: students showing improvement */
  progress: {
    improving: number;
    stable: number;
    declining: number;
    total: number;
  };
  /** At-risk prediction */
  predictions: Array<{
    studentId: string;
    riskLevel: 'high' | 'medium' | 'low';
    weakestSkill: string;
    overallMastery: number;
  }>;
  /** Chart-ready data */
  charts: {
    skillRadar: Record<string, number>;
    progressBar: Array<{ label: string; value: number }>;
    trendLine: TrendPoint[];
  };
  generatedAt: Date;
}

export interface LearningStats {
  studentId: string;
  totalPractices: number;
  totalMistakes: number;
  totalVocabulary: number;
  totalWritingSubmissions: number;
  overallMastery: number;
  streak: number;
  /** Weekly breakdown */
  weeklyActivity: Array<{ week: string; practices: number; mistakes: number }>;
  generatedAt: Date;
}
