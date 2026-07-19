// Sprint 40: AI Learning Analytics Pro — types
export interface AnalyticsInput {
  studentId: string;
  gradeLevel: string;
  startDate: string;
  endDate: string;
  sessions: SessionDataPoint[];
  mistakes: MistakeDataPoint[];
  vocabulary: VocabDataPoint[];
  writing: WritingDataPoint[];
  reviews: ReviewDataPoint[];
}

export interface SessionDataPoint {
  date: string; durationMinutes: number; questionsAnswered: number; correctCount: number; skill?: string;
}
export interface MistakeDataPoint {
  date: string; type: string; skill: string;
}
export interface VocabDataPoint {
  date: string; word: string; mastered: boolean;
}
export interface WritingDataPoint {
  date: string; textType: string; score: number; wordCount: number;
}
export interface ReviewDataPoint {
  date: string; itemId: string; quality: number;
}

// ============================================
// Weekly Report
// ============================================

export interface WeeklyReport {
  studentId: string;
  weekStart: string;
  generatedAt: string;
  summary: {
    sessionsCompleted: number;
    totalStudyMinutes: number;
    questionsAnswered: number;
    accuracy: number;
    newWordsLearned: number;
    wordsReviewed: number;
    writingTasksCompleted: number;
    averageWritingScore: number;
  };
  dailyBreakdown: Array<{
    day: string; studyMinutes: number; questions: number; accuracy: number;
  }>;
  topSkills: Array<{ skill: string; accuracy: number; trend: string }>;
  weakestSkills: Array<{ skill: string; accuracy: number; trend: string }>;
  recommendations: string[];
  recommendationsZh: string[];
}

// ============================================
// Monthly Report
// ============================================

export interface MonthlyReport {
  studentId: string;
  month: string;
  generatedAt: string;
  overview: {
    totalStudyHours: number;
    sessionsCompleted: number;
    averageAccuracy: number;
    accuracyTrend: 'improving' | 'stable' | 'declining';
    masteryGain: number;
  };
  weeklyBreakdown: WeeklyBreakdown[];
  trends: {
    grammar: TrendSummary;
    vocabulary: TrendSummary;
    writing: TrendSummary;
    reading: TrendSummary;
    listening: TrendSummary;
  };
  learningVelocity: {
    current: number;
    previous: number;
    trend: string;
  };
  predictions: {
    nextMonthAccuracy: number;
    masteryProjection: number;
    estimatedLevel: string;
  };
  achievements: string[];
  achievementsZh: string[];
}

export interface WeeklyBreakdown {
  weekStart: string;
  sessions: number;
  accuracy: number;
  studyMinutes: number;
  highlight: string;
}

export interface TrendSummary {
  current: number;
  previous: number;
  change: number;
  trend: 'improving' | 'stable' | 'declining';
  chart: TrendChartPoint[];
}

export interface TrendChartPoint {
  period: string;
  value: number;
}

// ============================================
// Mastery + Retention
// ============================================

export interface MasteryTrendReport {
  studentId: string;
  generatedAt: string;
  overallMastery: number;
  masteryBySkill: Array<{
    skill: string;
    mastery: number;
    trend: string;
    predictedNextMonth: number;
    confidence: number;
  }>;
  masteryHistory: Array<{ date: string; mastery: number }>;
  projectedMastery: Array<{ date: string; projected: number; confidenceLow: number; confidenceHigh: number }>;
}

export interface RetentionPrediction {
  studentId: string;
  generatedAt: string;
  overallRetention: number;
  retentionBySkill: Array<{ skill: string; retention: number; decayRate: number; halfLifeDays: number }>;
  atRiskItems: Array<{ itemId: string; itemType: string; retention: number; recommendedReview: string }>;
  optimalReviewSchedule: Array<{ itemId: string; reviewDate: string; expectedRetention: number }>;
}

// ============================================
// Dashboard JSON
// ============================================

export interface AnalyticsDashboard {
  studentId: string;
  generatedAt: string;
  kpiCards: Array<{
    key: string; label: string; labelZh: string; value: number; unit: string;
    change: number; trend: 'up' | 'down' | 'stable'; color: string;
  }>;
  masteryChart: Array<{ skill: string; skillZh: string; current: number; projected: number }>;
  velocityChart: Array<{ week: string; velocity: number }>;
  accuracyTrend: Array<{ date: string; accuracy: number; movingAverage: number }>;
  studyTimeDistribution: Array<{ day: string; minutes: number }>;
  skillRadar: Array<{ skill: string; current: number; classAverage: number; max: number }>;
}