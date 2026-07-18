// Sprint 11: Domain Events — barrel
export type {
  DomainEvent, DomainEventType, EventHandler, EventPayloadMap,
  ExerciseCompletedPayload, EssaySubmittedPayload,
  VocabularyLearnedPayload, AssessmentFinishedPayload,
  StreakUpdatedPayload, AchievementUnlockedPayload,
} from './types';

export { on, emit, subscriberCount, clearAllSubscriptions } from './event-bus';

export {
  emitExerciseCompleted, emitEssaySubmitted,
  emitVocabularyLearned, emitAssessmentFinished,
} from './events/event-emitters';

export { initProgressHandler, getProgressStats, resetProgressStore } from './handlers/progress-handler';
export { initAchievementHandler, getAchievements, resetAchievementStore } from './handlers/achievement-handler';
