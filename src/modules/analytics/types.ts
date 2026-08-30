// Sprint 23: Learning Analytics Platform — types
import type { SkillDimension } from '@/modules/student/profile/types';

// ============================================
// Time Granularity
// ============================================

export type TimeGranularity = 'daily' | 'weekly' | 'monthly' | 'semester' | 'yearly';

// ============================================
// Progress Timeline
// ============================================

export interface TimelinePoint {
  date: string;           // ISO date string
  label: string;          // Human-readable label
  questionsAnswered: number;
  correctCount: number;
  accuracy: number;       // 0-1
  xpEarned: number;
  timeSpentMinutes: number;
  sessionsCompleted: number;
  newVocabulary: number;
  mistakesMade: number;
}

export interface ProgressTimeline {
  studentId: string;
  granularity: TimeGranularity;
  startDate: string;
  endDate: string;
  points: TimelinePoint[];
  summary: {
    totalQuestions: number;
    totalCorrect: number;
    overallAccuracy: number;
    totalXp: number;
    totalTimeMinutes: number;
    totalSessions: number;
    totalVocabulary: number;
    totalMistakes: number;
  };
}

// ============================================
// Learning Statistics
// ============================================

export interface LearningStatistics {
  studentId: string;
  generatedAt: Date;
  period: { start: string; end: string; granularity: TimeGranularity };
  overview: {
    totalQuestions: number;
    totalCorrect: number;
    overallAccuracy: number;
    totalSessions: number;
    totalTimeMinutes: number;
    activeDays: number;
    streakDays: number;
    currentLevel: number;
    totalXp: number;
  };
  bySkill: Record<SkillDimension, SkillStatistics>;
  byDifficulty: Record<string, DifficultyStatistics>;
  comparisons: {
    vsPreviousPeriod: PeriodComparison;
    vsPeers: PeerComparison | null;
  };
}

export interface SkillStatistics {
  questions: number;
  correct: number;
  accuracy: number;
  masteryScore: number;
  trend: 'improving' | 'stable' | 'declining';
  timeSpentMinutes: number;
}

export interface DifficultyStatistics {
  questions: number;
  correct: number;
  accuracy: number;
}

export interface PeriodComparison {
  accuracyChange: number;    // + = improved, - = declined
  questionsChange: number;
  sessionsChange: number;
  masteryChange: number;
}

export interface PeerComparison {
  percentile: number;        // 0-100
  aboveAverage: boolean;
  averageAccuracy: number;
  averageQuestions: number;
}

// ============================================
// Mastery Trend
// ============================================

export interface MasteryTrendPoint {
  date: string;
  skillId: string;
  skillName: string;
  skillNameZh: string;
  dimension: SkillDimension;
  masteryScore: number;
  accuracy: number;
  totalAttempts: number;
}

export interface MasteryTrend {
  studentId: string;
  granularity: TimeGranularity;
  points: MasteryTrendPoint[];
  topImproving: Array<{ skillId: string; name: string; nameZh: string; change: number }>;
  topDeclining: Array<{ skillId: string; name: string; nameZh: string; change: number }>;
  overallTrend: 'improving' | 'stable' | 'declining';
}

// ============================================
// Weakness Trend
// ============================================

export interface WeaknessTrendPoint {
  date: string;
  category: string;          // grammar point, vocabulary type, etc.
  categoryZh: string;
  mistakeCount: number;
  totalAttempts: number;
  errorRate: number;         // 0-1
  severity: 'critical' | 'major' | 'minor';
}

export interface WeaknessTrend {
  studentId: string;
  granularity: TimeGranularity;
  points: WeaknessTrendPoint[];
  persistentWeaknesses: Array<{ category: string; categoryZh: string; duration: number; avgErrorRate: number }>;
  resolvedWeaknesses: Array<{ category: string; categoryZh: string; resolvedAt: string }>;
  emergingWeaknesses: Array<{ category: string; categoryZh: string; recentErrorRate: number }>;
}

// ============================================
// Vocabulary Growth
// ============================================

export interface VocabularyGrowthPoint {
  date: string;
  totalWords: number;
  newWords: number;
  masteredWords: number;
  learningWords: number;
  reviewedWords: number;
  averageMastery: number;    // 0-5 star rating average
}

export interface VocabularyGrowth {
  studentId: string;
  granularity: TimeGranularity;
  points: VocabularyGrowthPoint[];
  summary: {
    totalVocabulary: number;
    masteredCount: number;
    learningCount: number;
    newCount: number;
    averageMasteryStars: number;
    reviewsDue: number;
    growthRate: number;      // words per week
  };
  topWords: Array<{ word: string; mastery: number; lastReviewed: string }>;
}

// ============================================
// Writing Growth
// ============================================

export interface WritingGrowthPoint {
  date: string;
  essaysSubmitted: number;
  averageContentScore: number;     // 0-7
  averageLanguageScore: number;    // 0-7
  averageOrganizationScore: number; // 0-7
  averageTotalScore: number;       // 0-21
  wordCount: number;
  chinglishIssuesFound: number;
  vocabularyUpgradesSuggested: number;
}

export interface WritingGrowth {
  studentId: string;
  granularity: TimeGranularity;
  points: WritingGrowthPoint[];
  summary: {
    totalEssays: number;
    averageCLOScore: number;       // 0-21
    bestScore: number;
    totalWordsWritten: number;
    improvementRate: number;       // score change per essay
  };
}

// ============================================
// Reading Growth
// ============================================

export interface ReadingGrowthPoint {
  date: string;
  passagesRead: number;
  questionsAnswered: number;
  correctCount: number;
  accuracy: number;
  averageReadTime: number;     // seconds per passage
  comprehensionScore: number;  // 0-100
}

export interface ReadingGrowth {
  studentId: string;
  granularity: TimeGranularity;
  points: ReadingGrowthPoint[];
  summary: {
    totalPassages: number;
    totalQuestions: number;
    overallAccuracy: number;
    comprehensionScore: number;
    readingSpeed: number;      // words per minute (estimated)
  };
}

// ============================================
// Prediction Engine
// ============================================

export interface Prediction {
  studentId: string;
  generatedAt: Date;
  targetDate: string;
  predictions: {
    estimatedAccuracy: number;
    estimatedMastery: number;
    // 2026-08-30 audit: 1-20 平台掌握度指數（不是 HKDSE Level 1-5）
    platformMasteryIndex: number;
    estimatedVocabulary: number;
    confidenceScore: number;
  };
  risks: RiskAssessment[];
  achievements: AchievementForecast[];
  recommendations: string[];
}

export interface RiskAssessment {
  type: 'accuracy-decline' | 'plateau' | 'disengagement' | 'overdue-review' | 'exam-readiness';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  descriptionZh: string;
  probability: number;         // 0-1
  affectedSkills: string[];
  mitigationSteps: string[];
}

export interface AchievementForecast {
  achievement: string;
  achievementZh: string;
  estimatedDate: string;
  confidence: number;          // 0-1
  daysToAchieve: number;
  progressPercent: number;     // 0-100
}

// ============================================
// Chart Data Generators
// ============================================

export interface HeatmapData {
  studentId: string;
  title: string;
  xLabels: string[];           // e.g., weeks
  yLabels: string[];           // e.g., skills
  data: number[][];            // intensity values 0-1
  colorScale: [string, string, string]; // [low, mid, high]
}

export interface RadarChartData {
  studentId: string;
  labels: string[];
  labelZh: string[];
  datasets: Array<{
    label: string;
    values: number[];          // 0-100
    color: string;
  }>;
  maxValue: number;
}

export interface TrendLineData {
  studentId: string;
  title: string;
  xAxis: string[];             // date labels
  series: Array<{
    name: string;
    nameZh: string;
    data: number[];
    trend: 'up' | 'down' | 'flat';
    slope: number;             // change per period
  }>;
}

export interface LearningVelocity {
  studentId: string;
  metrics: {
    questionsPerDay: number;
    accuracyGainPerWeek: number;
    masteryGainPerWeek: number;
    vocabularyPerWeek: number;
    essaysPerMonth: number;
    xpPerDay: number;
  };
  vsAverage: {
    questionsPerDay: { value: number; percentile: number };
    accuracyGainPerWeek: { value: number; percentile: number };
    masteryGainPerWeek: { value: number; percentile: number };
  };
  trajectory: 'accelerating' | 'steady' | 'decelerating';
}
