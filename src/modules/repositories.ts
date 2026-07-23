// ============================================
// Repository Barrel — centralized data access layer
// All Prisma access MUST go through these repositories
// Sprint 2: Repository Pattern
// ============================================

export * as StudentRepo from '@/modules/student/repositories/student-repo';
export * as AssessmentRepo from '@/modules/assessment/repositories/assessment-repo';
export * as VocabularyRepo from '@/modules/vocabulary/repositories/vocabulary-repo';
export * as ProgressRepo from '@/modules/student/progress/repositories/progress-repo';
export * as MaterialRepo from '@/modules/ai/repositories/material-repo';
export * as MistakeRepo from '@/modules/mistake/db/repositories/mistake-repo';
export * as PracticeRepo from '@/modules/exercise/repositories/practice-repo';
export * as NotificationRepo from '@/modules/notification/repositories/notification-repo';
