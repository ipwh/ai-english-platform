// Sprint 11: Progress Handler — updates progress stats on domain events
import { on } from '../event-bus';
import { logger } from '@/shared/logger/logger';

interface ProgressStats {
  totalExercises: number;
  totalEssays: number;
  totalVocabulary: number;
  totalAssessments: number;
  totalQuestionsAnswered: number;
  totalCorrect: number;
  lastActivityAt: Date | null;
}

const progressStore = new Map<string, ProgressStats>();

function getStats(studentId: string): ProgressStats {
  if (!progressStore.has(studentId)) {
    progressStore.set(studentId, {
      totalExercises: 0, totalEssays: 0, totalVocabulary: 0, totalAssessments: 0,
      totalQuestionsAnswered: 0, totalCorrect: 0, lastActivityAt: null,
    });
  }
  return progressStore.get(studentId)!;
}

/** Initialize progress handler — call once at app startup */
export function initProgressHandler(): void {
  on('exercise:completed', (event) => {
    const stats = getStats(event.payload.studentId);
    stats.totalExercises++;
    stats.totalQuestionsAnswered += event.payload.totalQuestions;
    stats.totalCorrect += event.payload.correctCount;
    stats.lastActivityAt = event.payload.completedAt;
    logger.debug({ module: 'progress-handler', studentId: event.payload.studentId, totalExercises: stats.totalExercises }, 'Progress updated');
  });

  on('essay:submitted', (event) => {
    const stats = getStats(event.payload.studentId);
    stats.totalEssays++;
    stats.lastActivityAt = event.payload.submittedAt;
  });

  on('vocabulary:learned', (event) => {
    const stats = getStats(event.payload.studentId);
    stats.totalVocabulary++;
    stats.lastActivityAt = event.payload.learnedAt;
  });

  on('assessment:finished', (event) => {
    const stats = getStats(event.payload.studentId);
    stats.totalAssessments++;
    stats.totalQuestionsAnswered += event.payload.totalQuestions;
    stats.totalCorrect += event.payload.correctCount;
    stats.lastActivityAt = event.payload.completedAt;
  });
}

/** Get progress stats for a student */
export function getProgressStats(studentId: string): ProgressStats {
  return getStats(studentId);
}

/** Reset stats (for testing) */
export function resetProgressStore(): void {
  progressStore.clear();
}
