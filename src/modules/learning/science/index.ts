// Sprint 30: AI Learning Science — barrel exports
// Sprint 33: Learning Science Engine — extended exports
export type {
  SpacedRepetitionState, ForgettingCurvePoint,
  RetrievalPracticeSession, RetrievalItem, InterleavingPlan, InterleavingBlock,
  DesirableDifficultyConfig, MetacognitionPrompt,
  ConfidenceWeightedMastery, LearningScienceReport,
  // Sprint 33 types
  ReviewScheduleEntry, LearningSessionInput, LearningSessionOutput,
  EffectivenessReport,
  ItemType, DifficultyLevel, DifficultyDirection, ReviewUrgency, LearningStrategy,
} from './types';

// Sprint 30: algorithms
export {
  sm2NextReview, createSRSState, isDueForReview, getDueItems,
  forgettingCurve, generateForgettingCurve, optimalReviewTime, calculateReviewStrength,
  scheduleRetrievalPractice, updateRetrievalStrength,
  generateInterleavingPlan,
  calculateDesirableDifficulty, optimalDifficultyLevel,
  generateMetacognitionPrompts, calculateCalibration,
  estimateMastery,
  generateLearningScienceReport,
} from './services/learning-science';

// Sprint 33: Learning Science Engine
export { LearningScienceEngine, learningScienceEngine } from './services/learning-science-engine';
export { ReviewScheduler, reviewScheduler } from './services/review-scheduler';
export { DifficultyAdjuster, difficultyAdjuster } from './services/difficulty-adjuster';
export { ConfidenceEstimator, confidenceEstimator } from './services/confidence-estimator';
export { LearningEffectivenessAnalyzer, learningEffectivenessAnalyzer } from './services/effectiveness-analyzer';
export { ReflectionGenerator, reflectionGenerator } from './services/reflection-generator';
export { learningScienceRepo } from '@/modules/learning/memory/repositories/learning-science-repository';
