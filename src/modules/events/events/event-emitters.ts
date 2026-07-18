// Sprint 11: Event Emitters — convenience functions for firing domain events
import { emit } from '../event-bus';
import type {
  ExerciseCompletedPayload, EssaySubmittedPayload,
  VocabularyLearnedPayload, AssessmentFinishedPayload,
} from '../types';

/** Fire when a student completes a practice exercise */
export async function emitExerciseCompleted(payload: ExerciseCompletedPayload) {
  await emit('exercise:completed', payload);
}

/** Fire when a student submits an essay for grading */
export async function emitEssaySubmitted(payload: EssaySubmittedPayload) {
  await emit('essay:submitted', payload);
}

/** Fire when a student learns a new vocabulary word */
export async function emitVocabularyLearned(payload: VocabularyLearnedPayload) {
  await emit('vocabulary:learned', payload);
}

/** Fire when an assessment (diagnostic/practice/daily challenge) finishes */
export async function emitAssessmentFinished(payload: AssessmentFinishedPayload) {
  await emit('assessment:finished', payload);
}
