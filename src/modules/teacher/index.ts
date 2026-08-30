// v5: TeacherFacade — Unified entry point for ALL teacher-related logic
// 2026-08-30 audit (R6): teacher/analytics + teacher/decisions 已刪除（零 runtime
// 消費者；analytics 路由曾以空學生列表生成假分析）。
export { teacherCopilotService } from '@/modules/teacher/copilot/services/teacher-copilot-service';
export type { WeeklyTeachingPlan, DailyPlan, ClassAnalysis, ExamPrediction } from '@/modules/teacher/copilot/types';
