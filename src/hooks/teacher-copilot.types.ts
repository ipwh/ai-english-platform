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

export interface DailyActivity { title: string; description: string; duration: string; }
export interface DailyPlan { day: string; date: string; activities: DailyActivity[]; homework: string[]; }
export interface WeeklyTeachingPlan {
  classId: string; focusSkills: string[];
  dailyPlans: DailyPlan[]; grammarFocus: string; vocabularyFocus: string; writingFocus: string;
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
  paperAnalysis: { paper: string; paperZh: string; averagePredicted: string }[];
}

export interface StudentAnalysisData {
  personaType: string; skillDetails: { skill: string; score: number; classAverage: number; percentile: number; trend: string }[];
  recentProgress: string; teacherNotes: string;
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
