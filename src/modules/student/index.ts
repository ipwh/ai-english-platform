// v4.1: StudentFacade — Unified entry point for ALL student-related logic
// Design Rule #3: Student Mastery is the single source of truth for ability.
// Design Rule #7: Student Twin represents digital learning state, not another profile.
// Design Rule #10: Always prefer reuse over duplication.

// ============================================
// Profile (identity, preferences, learning speed)
// ============================================
// 2026-09-23：「generateProfile」已刪除 —— 零 runtime consumer（只有 facade 轉出與
// 自身的測試），且其 `overallAccuracy: … : 0` 容許以 0 冒充「無資料」。
import { aggregateSkillStats, mapToDimension } from './profile/services/skill-tracker';
export { aggregateSkillStats, mapToDimension };
export type { PracticeRecord } from './profile/services/skill-tracker';
import { analyzeTopicPreferences } from './profile/services/topic-preferences';
export { analyzeTopicPreferences };
export type { TopicEngagement } from './profile/services/topic-preferences';
import { calculateLearningSpeed } from './profile/services/learning-speed';
export { calculateLearningSpeed };
export type { SessionRecord } from './profile/services/learning-speed';

// ============================================
// Mastery (S31) — SINGLE SOURCE OF TRUTH for ability
// ============================================
import {
  getLearningProfile,
  updateAfterExercise,
  updateAfterWriting,
  updateAfterVocabulary,
} from './mastery/services/student-mastery-service';
export {
  getLearningProfile,
  updateAfterExercise,
  updateAfterWriting,
  updateAfterVocabulary,
};
export type {
  StudentLearningProfile,
  MasteryEntry,
  SkillGroupedMastery,
  ExerciseResult,
} from './mastery/types';

// ============================================
// Memory (S36) — learning memory lifecycle
// ============================================
import { memoryService } from '@/modules/learning/memory/services/memory-service';
export { memoryService };
import { memoryEngine } from '@/modules/learning/memory/services/memory-engine';
export { memoryEngine };

// ============================================
// Progress — gamification, XP, streaks, badges, leaderboard
// ============================================
import { getStudentProgress, getDailyGoalProgress, getWeeklyActiveDays } from './progress/services/progress-service';
export { getStudentProgress, getDailyGoalProgress, getWeeklyActiveDays };
import { calculateStudentStreak, syncUserStreak, calculatePracticeStreak } from './progress/services/streak-service';
export { calculateStudentStreak, syncUserStreak, calculatePracticeStreak };
import {
  calculateXp, getLevelInfo, checkNewBadges, getAllBadges,
  getStudyRecommendation, buildLeaderboard, getDailyGoal,
  evaluateDailyGoal, eligibleBadgesFor, getGradeMultiplier,
} from './progress/services/gamification';
export {
  calculateXp, getLevelInfo, checkNewBadges, getAllBadges,
  getStudyRecommendation, buildLeaderboard, getDailyGoal,
  evaluateDailyGoal, eligibleBadgesFor, getGradeMultiplier,
};
export type { BadgeCheckStats, LeaderboardEntry, BadgeDefinition, DailyGoalStatus, DailyGoalProgress } from './progress/services/gamification';

// ============================================
// Twin (S20) — digital learning state
// Sprint 59: Canonical StudentState + StudentStateBuilder
// ============================================
import { studentTwinService } from './twin/services/student-twin-service';
export { studentTwinService };
export type {
  StudentTwin, LearningPersona, PersonaType,
  KnowledgeState, TwinPredictions, RiskAssessment,
} from './twin/types';

// Sprint 59: Canonical StudentState (ONE source of truth)
export { studentStateBuilder } from './state/StudentStateBuilder';
export { studentStateMutationService } from './state/StudentStateMutationService';
export type { StudentState, StudentIdentity, StudentMemory,
  StudentMastery, StudentWeakness, StudentVocabulary,
  StudentEngagement, StudentPracticeSummary } from './state/StudentState';

// ============================================
// v5: Common repository exports (for routes that need simple CRUD)
// Routes MUST import from here, NOT from repositories/ directly
// ============================================
export {
  findUserById, findUserByIdSelect, updateUser, deleteUser,
  listAllUsers, countUsers,
  listClasses, createClass, findClassByName, deleteClass, listAllClasses,
  listGroups, findGroupById, createGroup, updateGroup, deleteGroup,
  getUserPreferences, upsertUserPreferences,
  findTeacherClass, listTeacherClasses, deleteTeacherClasses, createTeacherClass,
  getStudentAnalytics,
  listAssignments, findAssignmentById, findAssignmentSubmissions, createAssignment,
  listSubmissionsForReview, findSubmissionById, updateSubmission,
  findReviewsBySubmissions, findReviewBySubmission, createReview,
  findIntegratedSkillsDraft, upsertIntegratedSkillsDraft, deleteIntegratedSkillsDraft,
  getUnreadNotificationCount,
  listGroupMembers, getUserXp, getUserStreakDays, listUsersAdmin,
} from '@/modules/student/repositories/user-repo';

// Re-export common repos through facade (Route ≠ Repository rule)
export { findTodaySession, createPracticeSession, listPracticeSessionsSimple as listPracticeSessions, countPracticeSessions, countTodaySessions, deletePracticeSession, findPracticeSessionByClientId } from '@/modules/exercise/repositories/practice-repo';
export { createXpTransaction, getTodaysXpTransaction, getLeaderboard, applyXpEventOnce } from './progress/repositories/progress-repo';
export { countVocab, getVocabStats, listVocabFiltered } from '@/modules/vocabulary/repositories/vocabulary-repo';
export { listDrafts, createDraft, findDraftById, updateDraft, countDrafts, findLatestDraft, findDraftWithRevisions } from '@/modules/writing-coach/repositories/writing-draft-repo';
export { listMistakes, listMistakesByType, listDueMistakesForReview, findMistakeById, updateMistake, bulkUpdateMistakes, bulkDeleteMistakes } from '@/modules/mistake/db/repositories/mistake-repo';
export { clearDiagnosticResults, createDiagnosticResult, getRecentDiagnostics, createFeedback } from '@/modules/assessment/repositories/diagnostic-repo';
export { listMaterialsFull, createMaterial, findMaterialById, updateMaterial, deleteMaterial, deleteMaterialChunks, countMaterials } from '@/modules/ai/repositories/material-repo';
export { memoryDbRepo } from '@/modules/learning/memory/repositories/memory-db-repository';
export { listNotifications, countUnreadNotifications, markNotificationRead, markNotificationsRead, createNotification } from '@/modules/notification/repositories/notification-repo';
export { updateVocab } from '@/modules/vocabulary/repositories/vocabulary-repo';

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
 * await StudentFacade.progress.get(studentId);
 */
export const StudentFacade = {
  // Profile
  profile: {
    // 2026-09-23：`generate` 已刪除（零 runtime consumer 的死碼）
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
