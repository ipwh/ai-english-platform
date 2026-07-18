// Sprint 4: Exercise Service — practice sessions, diagnostics, daily challenges
import {
  createPracticeSession, listPracticeSessions, countPracticeSessions,
  createPracticeAnswers, findTodaysChallenge, clearDiagnosticResults,
  createDiagnosticResults, getDiagnosticGrammarStats
} from '@/modules/exercise/repositories/exercise-repo';
import { logger } from '@/shared/logger/logger';

export interface PracticeRecord {
  studentId: string; skill: string; skillZh?: string; difficulty: string;
  totalQuestions: number; correctCount: number; source?: string;
  answers?: Array<{ questionIndex: number; studentAnswer: string; correctAnswer: string; isCorrect: boolean }>;
}

export async function recordPractice(record: PracticeRecord) {
  const session = await createPracticeSession({
    studentId: record.studentId, skill: record.skill || 'general',
    skillZh: record.skillZh || '綜合', difficulty: record.difficulty || 'core',
    totalQuestions: record.totalQuestions || 0, correctCount: record.correctCount || 0,
    source: record.source || 'practice',
  } as any);
  if (record.answers?.length) {
    await createPracticeAnswers(record.answers.map(a => ({
      sessionId: session.id, questionIndex: a.questionIndex,
      studentAnswer: a.studentAnswer, correctAnswer: a.correctAnswer, isCorrect: a.isCorrect,
    })) as any);
  }
  logger.info({ module: 'exercise-service', sessionId: session.id, studentId: record.studentId }, 'Practice recorded');
  return session;
}

export async function getStudentPractices(studentId: string, limit = 20) { return listPracticeSessions(studentId, limit); }
export async function getPracticeCount(studentId: string) { return countPracticeSessions(studentId); }
export async function getDailyChallenge(studentId: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return findTodaysChallenge(studentId, today);
}
export async function saveDiagnostic(studentId: string, results: Array<{ grammarItem: string; score: number; level: string }>) {
  await clearDiagnosticResults(studentId);
  await createDiagnosticResults(results.map(r => ({ ...r, studentId, completedAt: new Date() })) as any);
  logger.info({ module: 'exercise-service', studentId, count: results.length }, 'Diagnostic saved');
}
export async function getDiagnosticHistory(studentId: string) { return getDiagnosticGrammarStats(studentId); }
