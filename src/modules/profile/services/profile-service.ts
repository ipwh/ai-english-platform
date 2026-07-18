// Sprint 8: Student Learning Profile Service
// Aggregates data from all modules into a unified student profile
import type { StudentLearningProfile } from '../types';
import { aggregateSkillStats, type PracticeRecord } from './skill-tracker';
import { analyzeTopicPreferences, type TopicEngagement } from './topic-preferences';
import { calculateLearningSpeed, type SessionRecord } from './learning-speed';
import { logger } from '@/shared/logger/logger';

export interface ProfileInput {
  studentId: string;
  gradeLevel: string;
  practiceRecords: PracticeRecord[];
  sessions: SessionRecord[];
  topicEngagements: TopicEngagement[];
  streakDays: number;
  vocabularyStats: { total: number; mastered: number; learning: number; dueForReview: number };
  weakAreaIds: string[];
  recommendedSkillIds: string[];
}

/**
 * Generate a complete student learning profile.
 * This is the main entry point — it aggregates data from:
 * - ExerciseService (practice records)
 * - VocabularyService (vocab stats)
 * - ProgressService (streak)
 * - Learning Engine (weak areas, recommendations)
 */
export function generateProfile(input: ProfileInput): StudentLearningProfile {
  logger.info({ module: 'profile-service', studentId: input.studentId }, 'Generating learning profile');

  const skills = aggregateSkillStats(input.practiceRecords);
  const preferredTopics = analyzeTopicPreferences(input.topicEngagements);
  const learningSpeed = calculateLearningSpeed(input.sessions);

  const totalQuestions = input.practiceRecords.length;
  const totalCorrect = input.practiceRecords.filter(r => r.correct).length;
  const totalSessions = input.sessions.length;

  return {
    studentId: input.studentId,
    gradeLevel: input.gradeLevel,
    generatedAt: new Date(),
    totalPracticeSessions: totalSessions,
    totalQuestionsAnswered: totalQuestions,
    overallAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) / 100 : 0,
    skills,
    preferredTopics,
    learningSpeed,
    currentStreak: input.streakDays,
    weakAreas: input.weakAreaIds,
    recommendedSkills: input.recommendedSkillIds,
    vocabulary: input.vocabularyStats,
  };
}
