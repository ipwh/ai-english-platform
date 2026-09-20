// Sprint 8: Learning Speed — calculates student pace metrics
import type { LearningSpeed } from '../types';
import { hkDayKey } from '@/shared/utils/hk-date';

export interface SessionRecord {
  questionCount: number;
  correctCount: number;
  durationMs: number;      // estimated session duration
  startedAt: Date;
  wordsWritten?: number;   // for writing sessions
  vocabAdded?: number;     // for vocabulary sessions
}

/** Calculate learning speed from session history */
export function calculateLearningSpeed(sessions: SessionRecord[]): LearningSpeed {
  if (sessions.length === 0) {
    return {
      questionsPerSession: 0, avgTimePerQuestion: 0,
      sessionsLast7Days: 0, sessionsLast30Days: 0, totalSessions: 0,
      wordsPerWeek: 0, vocabPerWeek: 0, consistencyScore: 0,
    };
  }

  const now = new Date();
  const ms7Days = 7 * 86400000;
  const ms30Days = 30 * 86400000;

  const totalQuestions = sessions.reduce((sum, s) => sum + s.questionCount, 0);
  const totalDuration = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalWords = sessions.reduce((sum, s) => sum + (s.wordsWritten || 0), 0);
  const totalVocab = sessions.reduce((sum, s) => sum + (s.vocabAdded || 0), 0);

  const sessions7d = sessions.filter(s => (now.getTime() - s.startedAt.getTime()) <= ms7Days);
  const sessions30d = sessions.filter(s => (now.getTime() - s.startedAt.getTime()) <= ms30Days);

  // Consistency: unique active days in last 30 days / 30（日界線 = 香港日）
  const activeDays = new Set(sessions30d.map(s => hkDayKey(s.startedAt)));
  const consistencyScore = Math.min(1, activeDays.size / 30);

  // Words per week (average over last 30 days)
  const weeksActive = Math.max(1, sessions30d.length > 0 ? 4 : 1);
  const wordsPerWeek = Math.round(totalWords / weeksActive);
  const vocabPerWeek = Math.round(totalVocab / weeksActive);

  return {
    questionsPerSession: Math.round(totalQuestions / sessions.length),
    avgTimePerQuestion: totalQuestions > 0 ? Math.round(totalDuration / totalQuestions / 1000) : 0,
    sessionsLast7Days: sessions7d.length,
    sessionsLast30Days: sessions30d.length,
    totalSessions: sessions.length,
    wordsPerWeek,
    vocabPerWeek,
    consistencyScore: Math.round(consistencyScore * 100) / 100,
  };
}
