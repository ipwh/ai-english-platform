// v4.1: TeacherFacade — Unified entry point for ALL teacher-related logic
// Design Rule #6: Teacher Copilot never duplicates Recommendation logic. Always reuse Learning Engine.
// Design Rule #10: Architecture > features. Always prefer reuse over duplication.

// ============================================
// Copilot (S38) — lesson plans, assignments, class analysis, exam predictions
// ============================================
import { teacherCopilotService } from '@/modules/teacher-copilot/services/teacher-copilot-service';
export { teacherCopilotService };
export type {
  WeeklyTeachingPlan,
  DailyPlan,
  AssignmentRecommendation,
  ClassAnalysis,
  StudentAnalysis,
  ExamPrediction,
  CopilotOverview,
} from '@/modules/teacher-copilot/types';

// ============================================
// Analytics (S24) — class overview, weak skills, rankings, risk predictions
// ============================================
import {
  analyzeClass,
  detectWeakSkills,
  rankWriting,
  rankReading,
  compareStudent,
  predictRisks,
  generateSuggestions,
  detectLearningGaps,
  generateAIReport,
} from '@/modules/teacher-analytics/services/teacher-analytics';
export {
  analyzeClass,
  detectWeakSkills,
  rankWriting,
  rankReading,
  compareStudent,
  predictRisks,
  generateSuggestions,
  detectLearningGaps,
  generateAIReport,
};
export type {
  ClassOverview,
  WeakSkill,
  StudentRanking,
  RiskPrediction,
  LearningSuggestion,
  AIReport,
} from '@/modules/teacher-analytics/types';

// ============================================
// Dashboard (S37) — trends, class comparison, progress (reuses Learning Analytics)
// ============================================
import { buildTeacherDashboard } from '@/modules/learning-analytics/services/learning-analytics-service';
export { buildTeacherDashboard };
export type { TeacherDashboard } from '@/modules/learning-analytics/types';

// ============================================
// Unified Facade Object
// ============================================

/**
 * TeacherFacade — v4.1
 *
 * ALL teacher-related logic must be accessed through this facade.
 * Teacher services MUST reuse Learning services — never duplicate recommendation logic.
 *
 * Domains:
 *   Copilot   — lesson plans, assignments, class analysis, exam predictions (S38)
 *   Analytics — class overview, weak skills, rankings, risk predictions (S24)
 *   Dashboard — trends, class comparison, progress charts (S37)
 *
 * Cross-domain reuse (Rule #6 compliance):
 *   Analytics warns about weak skills → calls LearningFacade for recommendations
 *   Copilot generates assignments → calls LearningFacade for topic recommendations
 *   Dashboard shows trends → reads from LearningFacade analytics
 *
 * @example
 * import { TeacherFacade } from '@/modules/teacher';
 * const plan = await TeacherFacade.copilot.generateLessonPlan(classId, name);
 * const risks = await TeacherFacade.analytics.predictRisks(classId);
 */
export const TeacherFacade = {
  copilot: {
    service: teacherCopilotService,
    generateLessonPlan: (classId: string, className: string) =>
      teacherCopilotService.generateLessonPlan(classId, className),
    generateAssignments: (classId: string) =>
      teacherCopilotService.generateAssignments(classId),
    analyzeClass: (classId: string, className: string) =>
      teacherCopilotService.analyzeClass(classId, className),
    analyzeStudent: (studentId: string, classId: string) =>
      teacherCopilotService.analyzeStudent(studentId, classId),
    predictExam: (classId: string) =>
      teacherCopilotService.predictExam(classId),
    getOverview: (teacherId: string) =>
      teacherCopilotService.getOverview(teacherId),
  },

  analytics: {
    analyzeClass,
    detectWeakSkills,
    rankWriting,
    rankReading,
    compareStudent,
    predictRisks,
    generateSuggestions,
    detectLearningGaps,
    generateAIReport,
  },

  dashboard: {
    build: buildTeacherDashboard,
  },
} as const;
