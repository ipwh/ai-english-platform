// Sprint 22: Adaptive Recommendation Engine — barrel exports
export type {
  RecommendationInput, RecommendationResult, Recommendation,
  ScoredRecommendation, ScoreFactors,
  RecommendationType, RecommendationStrategy,
  MasteryScoreEntry, LearningProfileSnapshot,
  MistakeStatsSnapshot, SessionSnapshot, TopicPreferenceSnapshot,
  StrategyContext, StrategyResult,
} from './types';

export { RecommendationEngine } from './services/recommendation-engine';
export { recommendationService } from './services/recommendation-service';
export { recommendationRepo } from './repositories/recommendation-repository';
export {
  WeaknessExerciseStrategy, SpacedRepetitionStrategy,
  MistakeReviewStrategy, TopicPreferenceStrategy, LearningPathStrategy,
  VocabularyReviewStrategy, SkillSpecificStrategy, StreakMaintenanceStrategy,
} from './services/recommendation-strategy';
export { scoreRecommendation, scoreAll, getConfidenceBand } from './services/recommendation-scorer';
export { generateReasons, enrichRecommendations } from './services/recommendation-reason-generator';
