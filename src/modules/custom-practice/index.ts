// ============================================
// Self-Directed Practice — module barrel (2026-10-10, Sprint 140)
// ============================================
// Public surface for API routes. Everything else in this module is internal.
// ============================================

export {
  CustomPracticeError,
  isObjectiveQuestionType,
  OBJECTIVE_QUESTION_TYPES,
} from './domain/types';
export type {
  CustomPracticeErrorCode,
  DeliveredQuestion,
  DeliveredResponse,
  DeliveredResults,
  DeliveredSet,
  GradedItem,
  PracticeCategory,
  PracticeDifficulty,
  PracticeQuestionType,
  PracticeSpec,
  PracticeVerdict,
  ValidatedQuestion,
} from './domain/types';

export {
  DEFAULT_EXERCISE_TYPES,
  DEFAULT_QUESTIONS,
  MAX_QUESTIONS,
  MAX_REQUEST_CHARS,
  MIN_QUESTIONS,
  MIN_REQUEST_CHARS,
  buildObjective,
  inferCategory,
  normalizePracticeRequest,
  normalizeRequestText,
} from './services/request-normalizer';
export type { NormalizeRequestInput, NormalizeRequestResult } from './services/request-normalizer';

export { generateCustomPracticeSet, validateGeneratedQuestions } from './services/generation-service';
export type { DroppedQuestion, GeneratePracticeSetResult, ValidateGeneratedQuestionsResult } from './services/generation-service';

export {
  OPEN_ENDED_MIN_CONFIDENCE,
  buildOverallFeedback,
  gradeObjectiveItem,
  normalizeFreeTextAnswer,
} from './services/grading-service';
export type { GradePracticeSetResult, ObjectiveGradingInput, OpenEndedQuestionInput } from './services/grading-service';

export { toDeliveredResults, toDeliveredSet } from './services/delivery-service';

export { submitCustomPracticeSet } from './services/submission-service';

export { getOwnedSet, getSubmissionWithResponses, listOwnSets } from './repositories/custom-practice-repo';
