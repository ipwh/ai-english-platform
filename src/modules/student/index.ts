// v4.1: StudentFacade — Unified entry point for ALL student-related logic
// Design Rule #3: Student Mastery is the single source of truth for ability.
// Design Rule #7: Student Twin represents digital learning state, not another profile.
// Design Rule #10: Always prefer reuse over duplication.

// ============================================
// Profile (identity, preferences, learning speed)
// ============================================
export { generateProfile } from '@/modules/profile/services/profile-service';
export type { ProfileInput } from '@/modules/profile/services/profile-service';
export { aggregateSkillStats, mapToDimension } from '@/modules/profile/services/skill-tracker';
export type { PracticeRecord } from '@/modules/profile/services/skill-tracker';
export { analyzeTopicPreferences } from '@/modules/profile/services/topic-preferences';
export type { TopicEngagement } from '@/modules/profile/services/topic-preferences';
export { calculateLearningSpeed } from '@/modules/profile/services/learning-speed';
export type { SessionRecord } from '@/modules/profile/services/learning-speed';

// ============================================
// Mastery (S31) — SINGLE SOURCE OF TRUTH for ability
// ============================================
export {
  getLearningProfile,
  updateAfterExercise,
  updateAfterWriting,
  updateAfterVocabulary,
} from '@/modules/student-mastery/services/student-mastery-service';
export type {
  StudentLearningProfile,
  MasteryEntry,
  SkillGroupedMastery,
  ExerciseResult,
} from '@/modules/student-mastery/types';

// ============================================
// Memory (S36) — learning memory lifecycle
// ============================================
export { memoryService } from '@/modules/learning-memory/services/memory-service';
export { memoryEngine } from '@/modules/learning-memory/services/memory-engine';

// ============================================
// Progress — gamification, XP, streaks
// ============================================

// ============================================
// Twin (S20) — digital learning state
// ============================================

/**
 * StudentFacade — v4.1
 *
 * ALL student-related logic must be accessed through this facade.
 * Other modules should NOT directly call student repositories.
 *
 * @example
 * import { StudentFacade } from '@/modules/student';
 * const profile = await StudentFacade.getLearningProfile(studentId);
 */
export const StudentFacade = {
  // Identity
  generateProfile,
  aggregateSkillStats,
  analyzeTopicPreferences,
  calculateLearningSpeed,

  // Mastery (single source of truth)
  getLearningProfile,
  updateAfterExercise,
  updateAfterWriting,
  updateAfterVocabulary,

  // Memory
  memoryService,
  memoryEngine,
} as const;
