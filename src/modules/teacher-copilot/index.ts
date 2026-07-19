// Sprint 38: Teacher Copilot — barrel exports
export type {
  WeeklyTeachingPlan, DailyPlan, Activity, HomeworkItem,
  GrammarFocus, VocabularyFocus, WritingFocus,
  ClassAnalysis, StudentAnalysis, AssignmentRecommendation,
  ExamPrediction, CopilotOverview,
} from './types';

export { TeacherCopilotService, teacherCopilotService } from './services/teacher-copilot-service';
