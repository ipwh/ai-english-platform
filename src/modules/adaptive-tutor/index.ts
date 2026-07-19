// Sprint 35: Adaptive AI Tutor — barrel exports
export type {
  PersonalizationContext, SessionSummary, MistakeSummary,
  TutorActionType, TutorOutput,
  AdaptiveDifficulty, AdaptiveHintLevel,
  AdaptiveVocabulary, AdaptiveGrammar, AdaptiveReading, AdaptiveWriting,
  ExerciseFormat, ExerciseSpec,
  FeedbackLevel, FeedbackSpec,
  TutorSessionRecord,
} from './types';

export { AdaptiveTutorEngine, adaptiveTutorEngine } from './services/adaptive-tutor-engine';
export { ExerciseSelector, exerciseSelector } from './services/exercise-selector';
export { HintGenerator, hintGenerator } from './services/hint-generator';
export { FeedbackComposer, feedbackComposer } from './services/feedback-composer';
export { ExplanationAdapter, explanationAdapter } from './services/explanation-adapter';
export { ChallengeCurator, challengeCurator } from './services/challenge-curator';
