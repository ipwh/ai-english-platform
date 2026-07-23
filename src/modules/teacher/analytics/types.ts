// Sprint 24: Teacher Intelligence Dashboard — types
import type { SkillDimension } from '@/modules/student/profile/types';

export interface ClassOverview {
  classId: string;
  className: string;
  academicYear: string;
  studentCount: number;
  activeStudents: number;
  averageAccuracy: number;
  averageMastery: number;
  totalPracticeSessions: number;
  totalQuestionsAnswered: number;
  averageStreakDays: number;
  bySkill: Record<SkillDimension, { averageAccuracy: number; averageMastery: number; studentCount: number }>;
  topPerformers: Array<{ studentId: string; name: string; accuracy: number; xp: number }>;
  atRiskStudents: Array<{ studentId: string; name: string; accuracy: number; riskLevel: string }>;
}

export interface WeakSkill {
  skill: SkillDimension;
  skillNameZh: string;
  affectedStudentCount: number;
  affectedPercent: number;
  averageAccuracy: number;
  commonMistakes: Array<{ description: string; descriptionZh: string; frequency: number }>;
  recommendedActions: Array<{ action: string; actionZh: string; priority: 'high' | 'medium' | 'low' }>;
}

export interface StudentRanking {
  studentId: string;
  name: string;
  score: number;
  rank: number;
  totalStudents: number;
  percentile: number;
  change: number; // Rank change vs previous period
}

export interface StudentComparison {
  studentId: string;
  name: string;
  comparedTo: 'class-average' | 'grade-average';
  metrics: {
    accuracy: { value: number; average: number; difference: number };
    mastery: { value: number; average: number; difference: number };
    questionsAnswered: { value: number; average: number; difference: number };
    streakDays: { value: number; average: number; difference: number };
    vocabularySize: { value: number; average: number; difference: number };
  };
  bySkill: Record<SkillDimension, { value: number; average: number; difference: number }>;
  strengths: SkillDimension[];
  weaknesses: SkillDimension[];
}

export interface RiskPrediction {
  studentId: string;
  name: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: Array<{
    factor: string;
    factorZh: string;
    impact: 'positive' | 'negative';
    weight: number;
  }>;
  predictedAccuracy: number;
  interventionNeeded: boolean;
  suggestedActions: Array<{ action: string; actionZh: string }>;
}

export interface LearningSuggestion {
  studentId: string;
  name: string;
  suggestions: Array<{
    type: 'practice' | 'review' | 'vocabulary' | 'writing' | 'reading' | 'challenge';
    skill: SkillDimension;
    title: string;
    titleZh: string;
    reason: string;
    reasonZh: string;
    priority: 'must-do' | 'should-do' | 'could-do';
    estimatedTimeMinutes: number;
  }>;
}

export interface LearningGap {
  skill: SkillDimension;
  skillNameZh: string;
  expectedLevel: string;
  actualLevel: string;
  gapSize: number;
  affectedStudents: number;
  trend: 'widening' | 'stable' | 'narrowing';
  rootCauses: string[];
}

export interface AIReport {
  classId: string;
  generatedAt: string;
  summary: {
    overallAssessment: string;
    overallAssessmentZh: string;
    keyFindings: string[];
    keyFindingsZh: string[];
  };
  highlights: Array<{ title: string; titleZh: string; detail: string; detailZh: string }>;
  concerns: Array<{ title: string; titleZh: string; detail: string; detailZh: string; severity: string }>;
  recommendations: Array<{ action: string; actionZh: string; rationale: string; rationaleZh: string }>;
  projectedOutcomes: Array<{ description: string; descriptionZh: string; timeframe: string }>;
}

export interface TeacherDashboardInput {
  classId: string;
  className: string;
  academicYear: string;
  students: StudentData[];
}

export interface StudentData {
  studentId: string;
  name: string;
  nameZh: string;
  gradeLevel: string;
  accuracy: number;
  masteryScore: number;
  totalQuestions: number;
  totalCorrect: number;
  streakDays: number;
  xp: number;
  vocabularySize: number;
  lastActiveDate: string;
  bySkill: Record<SkillDimension, { accuracy: number; mastery: number; questions: number }>;
  mistakes: Array<{ category: string; count: number }>;
  recentTrend: 'improving' | 'stable' | 'declining';
}
