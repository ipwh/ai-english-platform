// Sprint 24: Teacher Intelligence Dashboard — barrel exports
export type {
  ClassOverview, WeakSkill, StudentRanking, StudentComparison,
  RiskPrediction, LearningSuggestion, LearningGap, AIReport,
  TeacherDashboardInput, StudentData,
} from './types';

export {
  analyzeClass, detectWeakSkills, rankWriting, rankReading,
  compareStudent, predictRisks, generateSuggestions,
  detectLearningGaps, generateAIReport,
  classifyActivity, daysSinceLastActive,
  INACTIVE_AFTER_DAYS, LOW_ACTIVITY_AFTER_DAYS,
} from './services/teacher-analytics';
export type { ActivityStatus } from './services/teacher-analytics';
