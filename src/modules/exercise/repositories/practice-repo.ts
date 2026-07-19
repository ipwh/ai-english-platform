// ============================================
// Practice Repository — centralized data access for practice sessions & answers
// P1: Repository Layer Migration
// ============================================

import { db } from '@/shared/db/db';

/** Create a practice session */
export async function createPracticeSession(data: {
  studentId: string;
  skill: string;
  skillZh: string;
  difficulty: string;
  totalQuestions: number;
  correctCount: number;
  source: string;
}) {
  return db.practiceSession.create({ data });
}

/** Create answers for a practice session */
export async function createPracticeAnswers(
  sessionId: string,
  answers: Array<{
    questionIndex: number;
    questionType?: string;
    questionPrompt?: string;
    correctAnswer: string;
    studentAnswer: string;
    isCorrect: boolean;
    timeSpent?: number;
  }>
) {
  if (!answers || answers.length === 0) return [];
  return db.practiceAnswer.createMany({
    data: answers.map((a, idx) => ({
      sessionId,
      questionIndex: a.questionIndex ?? idx,
      questionType: a.questionType || 'mc',
      questionPrompt: a.questionPrompt || '',
      correctAnswer: a.correctAnswer || '',
      studentAnswer: a.studentAnswer || '',
      isCorrect: a.isCorrect,
      timeSpent: a.timeSpent ?? null,
    })),
  });
}

/** List practice sessions for a student */
export async function listPracticeSessions(studentId: string, limit = 50) {
  return db.practiceSession.findMany({
    where: { studentId },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/** Find a practice session by ID */
export async function findPracticeSession(id: string) {
  return db.practiceSession.findUnique({
    where: { id },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
  });
}

/** Update a practice session (e.g., mark as completed) */
export async function completePracticeSession(id: string, correctCount: number) {
  return db.practiceSession.update({
    where: { id },
    data: { completedAt: new Date(), correctCount },
  });
}

/** Get today's practice session count for daily challenge */
export async function getTodayPracticeCount(studentId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return db.practiceSession.count({
    where: {
      studentId,
      startedAt: { gte: today },
    },
  });
}
