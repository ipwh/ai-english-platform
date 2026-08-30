// ============================================
// Teacher Copilot — shared types
//
// Extracted from useTeacherCopilot() for:
// - Single source of truth
// - Reusable across hook + page + tests
// ============================================

export interface ClassInfo {
  classId: string; className: string; studentCount: number;
  averageMastery: number;
  topConcern?: string; topConcernZh?: string;
  nextAction?: string; nextActionZh?: string;
}
export interface UrgentAction {
  type: string;
  description: string;
  descriptionZh?: string;
  classId?: string;
  className?: string;
}
export interface WeeklySummary { totalStudents: number; assignmentsDue: number; newRisksDetected: number; }
export interface CopilotOverview { classes: ClassInfo[]; urgentActions: UrgentAction[]; weeklySummary: WeeklySummary; }

export interface DailyActivity { type?: string; title?: string; description: string; descriptionZh?: string; duration?: string; durationMinutes?: number; }
export interface DailyPlan {
  day: string; date?: string; skill?: string; topic?: string; topicZh?: string;
  activities: DailyActivity[];
  homework: Array<string | { type?: string; description: string; descriptionZh?: string; estimatedMinutes?: number; dueDate?: string }>;
  estimatedMinutes?: number;
}
export interface WeeklyTeachingPlan {
  classId: string; className?: string; weekStart?: string; generatedAt?: string;
  focusSkills: string[];
  dailyPlans: DailyPlan[];
  grammarFocus: string | { topics?: Array<{ topic: string; topicZh: string }>; commonMistakes?: string[] };
  vocabularyFocus: string | { themes?: string[]; targetWordCount?: number };
  writingFocus: string | { textTypes?: Array<{ type: string; typeZh: string }>; suggestedTopics?: string[] };
  materialsRecommendation?: string[];
}

export interface SkillBreakdown {
  skill: string; skillZh?: string;
  averageScore: number; classAverage?: number;
  trend: string; targetLevel?: number;
}
export interface RiskStudent {
  studentId: string; name: string; studentName?: string;
  riskLevel: string;
  primaryConcern: string; primaryConcernZh?: string;
  reasons?: string[];
}
export interface ClassAnalysis {
  overallMetrics: { averageMastery: number; classHkdseLevel: string };
  skillBreakdown: SkillBreakdown[];
  studentRankings: { studentId: string; name: string; score: number; overallScore?: number }[];
  riskStudents: RiskStudent[];
  recommendations: string[];
  recommendationsZh?: string[];
}

export interface StudentPrediction { studentId: string; studentName: string; predictedLevel: string; confidenceBand: string; }
export interface ExamPrediction {
  predictedPassRate: number;
  studentPredictions: StudentPrediction[];
  paperAnalysis: { paper: string; paperZh: string; classAverage: number }[];
}

export interface StudentAnalysisData {
  personaType: string | null;
  skillDetails: { skill: string; score: number; classAverage: number | null; percentile: number | null; trend: string }[];
  recentProgress: string | { sessionsThisWeek?: number | null; accuracyTrend?: string | null; masteryGained?: number | null; timeSpent?: number | null };
  teacherNotes: string | { strengths?: string[]; weaknesses?: string[]; suggestedFocus?: string[] };
}

export interface LoadingMap {
  overview: boolean;
  lessonPlan: boolean;
  classAnalysis: boolean;
  examPrediction: boolean;
  generate: boolean;
  studentAnalysis: boolean;
}

/** Per-action error state — each loading key owns its error message */
export type ErrorMap = Partial<Record<keyof LoadingMap, string>>;
