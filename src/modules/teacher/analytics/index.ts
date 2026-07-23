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
} from './services/teacher-analytics';
