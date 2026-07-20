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
// Progress — gamification, XP, streaks, badges, leaderboard
// ============================================
export { getStudentProgress, awardXp } from '@/modules/progress/services/progress-service';
export { calculateStudentStreak, syncUserStreak } from '@/modules/progress/services/streak-service';
export {
  calculateXp, getLevelInfo, checkNewBadges, getAllBadges,
  getStudyRecommendation, buildLeaderboard, getDailyGoal,
  type BadgeCheckStats, type LeaderboardEntry, type BadgeDefinition,
} from '@/modules/progress/services/gamification';

// ============================================
// Twin (S20) — digital learning state
// ============================================
export { studentTwinService } from '@/modules/student-twin/services/student-twin-service';
export type {
  StudentTwin, LearningPersona, PersonaType,
  KnowledgeState, TwinPredictions, RiskAssessment,
} from '@/modules/student-twin/types';

// ============================================
// Unified Facade Object
// ============================================

/**
 * StudentFacade — v4.1
 *
 * ALL student-related logic must be accessed through this facade.
 * Other modules should NOT directly call student repositories.
 *
 * Domains:
 *   Profile  — identity, preferences, learning speed
 *   Mastery  — SINGLE SOURCE OF TRUTH for ability (S31)
 *   Memory   — learning memory lifecycle (S36)
 *   Progress — gamification, XP, streaks, badges
 *   Twin     — digital learning state (S20)
 *
 * @example
 * import { StudentFacade } from '@/modules/student';
 * const profile = await StudentFacade.getLearningProfile(studentId);
 * await StudentFacade.awardXp(studentId, 'answerCorrect');
 */
export const StudentFacade = {
  // Profile
  profile: {
    generate: generateProfile,
    aggregateSkills: aggregateSkillStats,
    analyzeTopics: analyzeTopicPreferences,
    learningSpeed: calculateLearningSpeed,
  },

  // Mastery (single source of truth)
  mastery: {
    getProfile: getLearningProfile,
    updateAfterExercise,
    updateAfterWriting,
    updateAfterVocabulary,
  },

  // Memory
  memory: {
    service: memoryService,
    engine: memoryEngine,
  },

  // Progress
  progress: {
    get: getStudentProgress,
    awardXp,
    streak: calculateStudentStreak,
    syncStreak: syncUserStreak,
    levelInfo: getLevelInfo,
    checkBadges: checkNewBadges,
    allBadges: getAllBadges,
    studyRecommendation: getStudyRecommendation,
    leaderboard: buildLeaderboard,
    dailyGoal: getDailyGoal,
  },

  // Twin
  twin: {
    service: studentTwinService,
  },
} as const;
