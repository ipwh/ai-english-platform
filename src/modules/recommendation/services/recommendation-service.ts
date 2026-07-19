// Sprint 22: Recommendation Service — business logic facade
import { recommendationRepo } from '../repositories/recommendation-repository';
import { RecommendationEngine } from './recommendation-engine';
import type {
  RecommendationInput, RecommendationResult, Recommendation,
  MasteryScoreEntry, LearningProfileSnapshot,
  MistakeStatsSnapshot, SessionSnapshot, TopicPreferenceSnapshot,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';

class RecommendationService {
  /**
   * Generate recommendations from structured input data.
   * Uses caching for repeat calls within 5 minutes.
   */
  generate(input: RecommendationInput): RecommendationResult {
    return recommendationRepo.getOrGenerate(input);
  }

  /**
   * Quick recommendation — minimal input for a simple recommendation list.
   */
  quickRecommend(
    studentId: string,
    gradeLevel: string,
    masteryScores: MasteryScoreEntry[],
    options?: {
      focusSkill?: SkillDimension;
      availableStudyTime?: number;
      maxRecommendations?: number;
    },
  ): RecommendationResult {
    const input: RecommendationInput = {
      studentId,
      gradeLevel,
      masteryScores,
      learningProfile: this.emptyProfile(),
      mistakeStats: this.emptyMistakeStats(),
      sessionHistory: [],
      preferredTopics: [],
      availableStudyTime: options?.availableStudyTime || 30,
      focusSkill: options?.focusSkill,
      maxRecommendations: options?.maxRecommendations || 5,
    };
    return this.generate(input);
  }

  /**
   * Full recommendation with all data sources.
   */
  fullRecommend(
    studentId: string,
    gradeLevel: string,
    masteryScores: MasteryScoreEntry[],
    learningProfile: LearningProfileSnapshot,
    mistakeStats: MistakeStatsSnapshot,
    sessionHistory: SessionSnapshot[],
    preferredTopics: TopicPreferenceSnapshot[],
    availableStudyTime: number,
    options?: {
      focusSkill?: SkillDimension;
      maxRecommendations?: number;
    },
  ): RecommendationResult {
    return this.generate({
      studentId,
      gradeLevel,
      masteryScores,
      learningProfile,
      mistakeStats,
      sessionHistory,
      preferredTopics,
      availableStudyTime,
      focusSkill: options?.focusSkill,
      maxRecommendations: options?.maxRecommendations || 8,
    });
  }

  /**
   * Invalidate cached recommendations for a student
   * (call after new practice session or mistake review).
   */
  invalidateCache(studentId: string): void {
    recommendationRepo.invalidate(studentId);
  }

  // ============================================
  // Empty/default snapshots for quick recommendations
  // ============================================

  private emptyProfile(): LearningProfileSnapshot {
    return {
      overallAccuracy: 0, totalPracticeSessions: 0, totalQuestionsAnswered: 0,
      currentStreak: 0, questionsPerSession: 0, sessionsLast7Days: 0,
      vocabularyStats: { total: 0, mastered: 0, learning: 0, dueForReview: 0 },
    };
  }

  private emptyMistakeStats(): MistakeStatsSnapshot {
    return {
      totalMistakes: 0, reviewedCount: 0, pendingReviewCount: 0,
      byCategory: {}, topGrammarPoints: [], recent7Days: 0, recent30Days: 0,
    };
  }
}

export const recommendationService = new RecommendationService();
