// v5: TeacherFacade — Unified entry point for ALL teacher-related logic
export { teacherCopilotService } from '@/modules/teacher-copilot/services/teacher-copilot-service';
export type { WeeklyTeachingPlan, DailyPlan, ClassAnalysis, ExamPrediction } from '@/modules/teacher-copilot/types';
export {
  analyzeClass, detectWeakSkills, rankWriting, rankReading,
  compareStudent, predictRisks, generateSuggestions,
  detectLearningGaps, generateAIReport,
} from '@/modules/teacher-analytics';
export type {
  ClassOverview, WeakSkill, StudentRanking, StudentComparison,
  RiskPrediction, LearningSuggestion, LearningGap, AIReport,
  TeacherDashboardInput,
} from '@/modules/teacher-analytics/types';

// Sprint 66: Teacher Decision Support
export { teacherDecisionEngine, TeacherDecisionEngine } from './decisions/TeacherDecisionEngine';
export type {
  TeacherDecision, ClassLearningSnapshot, StudentCluster, ClassAnalysis as TeacherClassAnalysis,
} from './decisions/TeacherDecision';
