// ============================================
// Repository Barrel — centralized data access layer
// All Prisma access MUST go through these repositories
// Sprint 2: Repository Pattern
// ============================================

export * as StudentRepo from '@/modules/student/repositories/student-repo';
export * as AssessmentRepo from '@/modules/assessment/repositories/assessment-repo';
export * as VocabularyRepo from '@/modules/vocabulary/repositories/vocabulary-repo';
export * as ExerciseRepo from '@/modules/exercise/repositories/exercise-repo';
export * as ProgressRepo from '@/modules/progress/repositories/progress-repo';
