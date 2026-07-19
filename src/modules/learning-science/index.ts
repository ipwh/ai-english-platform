// Sprint 30: AI Learning Science — barrel exports
export type {
  SpacedRepetitionState, ForgettingCurvePoint,
  RetrievalPracticeSession, RetrievalItem, InterleavingPlan, InterleavingBlock,
  DesirableDifficultyConfig, MetacognitionPrompt,
  ConfidenceWeightedMastery, LearningScienceReport,
} from './types';

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
