// Sprint 38: Teacher Copilot — types
import type { SkillDimension } from '@/modules/student/profile/types';
import type { PersonaType } from '@/modules/student/twin/types';

// ============================================
// Weekly Teaching Plan
// ============================================

export interface WeeklyTeachingPlan {
  classId: string;
  className: string;
  weekStart: string;
  generatedAt: string;
  focusSkills: SkillDimension[];
  dailyPlans: DailyPlan[];
  grammarFocus: GrammarFocus;
  vocabularyFocus: VocabularyFocus;
  writingFocus: WritingFocus;
  materialsRecommendation: string[];
  materialsRecommendationZh: string[];
}

export interface DailyPlan {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  skill: SkillDimension;
  topic: string;
  topicZh: string;
  activities: Activity[];
  estimatedMinutes: number;
  homework: HomeworkItem[];
}

export interface Activity {
  type: 'warm-up' | 'instruction' | 'practice' | 'group-work' | 'assessment' | 'review';
  description: string;
  descriptionZh: string;
  durationMinutes: number;
  difficulty: 'remedial' | 'core' | 'challenge';
}

export interface HomeworkItem {
  type: 'worksheet' | 'online-exercise' | 'essay' | 'reading' | 'vocabulary' | 'review';
  description: string;
  descriptionZh: string;
  estimatedMinutes: number;
  dueDate: string;
}

export interface GrammarFocus {
  topics: Array<{ topic: string; topicZh: string; classErrorRate: number; priority: number }>;
  recommendedExercises: string[];
  recommendedExercisesZh: string[];
  commonMistakes: string[];
}

export interface VocabularyFocus {
  themes: string[];
  targetWordCount: number;
  recommendedWords: Array<{ word: string; meaning: string; meaningZh: string; difficulty: string }>;
  activities: string[];
  activitiesZh: string[];
}

export interface WritingFocus {
  textTypes: Array<{ type: string; typeZh: string; readiness: number }>;
  suggestedTopics: string[];
  suggestedTopicsZh: string[];
  rubricFocus: string[];
}

// ============================================
// Class Analysis
// ============================================

export interface ClassAnalysis {
  classId: string;
  className: string;
  studentCount: number;
  generatedAt: string;
  overallMetrics: {
    averageMastery: number;
    averageAccuracy: number;
    averageVelocity: number;
    classHkdseLevel: string;
    participationRate: number;
  };
  skillBreakdown: Array<{
    skill: SkillDimension;
    averageScore: number;
    belowThreshold: number; // students below 70%
    trend: 'improving' | 'stable' | 'declining';
  }>;
  studentRankings: Array<{
    studentId: string;
    name: string;
    overallScore: number;
    strongestSkill: string;
    weakestSkill: string;
    trend: string;
  }>;
  weaknessSummary: {
    topGrammarWeaknesses: string[];
    topVocabularyGaps: string[];
    commonWritingErrors: string[];
    readingComprehensionIssues: string[];
  };
  riskStudents: Array<{
    studentId: string;
    name: string;
    riskLevel: string;
    primaryConcern: string;
    primaryConcernZh: string;
  }>;
  recommendations: string[];
  recommendationsZh: string[];
}

// ============================================
// Student Analysis
// ============================================

export interface StudentAnalysis {
  studentId: string;
  studentName: string;
  generatedAt: string;
  /** null = twin 不可用（不杜撰 persona） */
  personaType: PersonaType | null;
  personaTypeZh: string;
  currentLevel: string;
  predictedLevel: string;
  skillDetails: Array<{
    skill: SkillDimension;
    score: number;
    /** null = 班級數據不可用 */
    classAverage: number | null;
    /** null = 平台不聲稱班級百分位 */
    percentile: number | null;
    trend: string;
    recommendation: string;
    recommendationZh: string;
  }>;
  recentProgress: {
    sessionsThisWeek: number | null;
    accuracyTrend: string | null;
    masteryGained: number | null;
    timeSpent: number | null;
  };
  teacherNotes: {
    strengths: string[];
    weaknesses: string[];
    suggestedFocus: string[];
    suggestedFocusZh: string[];
  };
}

// ============================================
// Assignment Recommendations
// ============================================

export interface AssignmentRecommendation {
  classId: string;
  generatedAt: string;
  assignments: Array<{
    title: string;
    titleZh: string;
    type: 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'integrated-skills' | 'review';
    skill: SkillDimension;
    difficulty: string;
    questionCount: number;
    estimatedMinutes: number;
    targetStudents: 'all' | 'struggling' | 'advanced' | string[];
    reason: string;
    reasonZh: string;
  }>;
  reviewAssignments: Array<{
    topic: string;
    topicZh: string;
    dueCount: number;
    urgency: string;
  }>;
}

// ============================================
// Exam Prediction
// ============================================

export interface ExamPrediction {
  classId: string;
  generatedAt: string;
  predictedClassAverage: number;
  predictedPassRate: number; // % above Level 3
  predictedStarRate: number; // % above Level 5
  studentPredictions: Array<{
    studentId: string;
    name: string;
    predictedLevel: string;
    predictedScore: number;
    confidenceBand: { low: number; high: number };
    strongestPaper: string;
    weakestPaper: string;
    readinessPercentage: number;
  }>;
  paperAnalysis: Array<{
    paper: string;
    paperZh: string;
    classAverage: number;
    topicsNeedingReview: string[];
    topicsNeedingReviewZh: string[];
  }>;
  recommendations: string[];
  recommendationsZh: string[];
}

// ============================================
// Teacher Copilot Overview
// ============================================

export interface CopilotOverview {
  teacherId: string;
  generatedAt: string;
  classes: Array<{
    classId: string;
    className: string;
    studentCount: number;
    /** Students active within the last 14 days (Sprint 133 behavior signal) */
    activeStudents: number;
    averageMastery: number;
    topConcern: string;
    topConcernZh: string;
    nextAction: string;
    nextActionZh: string;
  }>;
  urgentActions: Array<{
    type: 'risk' | 'assignment' | 'review' | 'planning';
    description: string;
    descriptionZh: string;
    classId: string;
    className: string;
  }>;
  weeklySummary: {
    totalStudents: number;
    activeStudents: number;
    assignmentsDue: number;
    pendingReviews: number;
    newRisksDetected: number;
  };
}