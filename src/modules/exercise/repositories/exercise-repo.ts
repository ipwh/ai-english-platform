// ============================================
// Exercise Repository — practice sessions, diagnostic, daily challenge
// THE ONLY layer allowed to access Prisma Practice/Diagnostic models
// Sprint 2: Repository Pattern
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

// ============================================
// Practice sessions
// ============================================

export async function createPracticeSession(data: Prisma.PracticeSessionCreateInput) {
  return db.practiceSession.create({ data });
}

export async function findPracticeSession(id: string) {
  return db.practiceSession.findUnique({ where: { id }, include: { answers: { orderBy: { questionIndex: 'asc' } } } });
}

export async function listPracticeSessions(studentId: string, limit = 20) {
  return db.practiceSession.findMany({
    where: { studentId }, include: { answers: true },
    orderBy: { startedAt: 'desc' }, take: limit,
  });
}

export async function countPracticeSessions(studentId: string) {
  return db.practiceSession.count({ where: { studentId } });
}

export async function updatePracticeSession(id: string, data: Prisma.PracticeSessionUpdateInput) {
  return db.practiceSession.update({ where: { id }, data });
}

// ============================================
// Practice answers
// ============================================

export async function createPracticeAnswers(data: Prisma.PracticeAnswerCreateManyInput[]) {
  return db.practiceAnswer.createMany({ data });
}

export async function listPracticeAnswers(sessionId: string) {
  return db.practiceAnswer.findMany({ where: { sessionId }, orderBy: { questionIndex: 'asc' } });
}

// ============================================
// Daily challenge
// ============================================

export async function findTodaysChallenge(studentId: string, todayStart: Date) {
  return db.practiceSession.findFirst({
    where: { studentId, source: 'daily-challenge', startedAt: { gte: todayStart } },
  });
}

// ============================================
// Diagnostic
// ============================================

export async function clearDiagnosticResults(studentId: string) {
  return db.diagnosticResult.deleteMany({ where: { studentId } });
}

export async function createDiagnosticResults(data: Prisma.DiagnosticResultCreateManyInput[]) {
  return db.diagnosticResult.createMany({ data });
}

export async function listDiagnosticResults(studentId: string) {
  return db.diagnosticResult.findMany({ where: { studentId }, orderBy: { completedAt: 'desc' } });
}

export async function getDiagnosticGrammarStats(studentId: string) {
  const [results, mistakeCount] = await Promise.all([
    db.diagnosticResult.findMany({ where: { studentId }, orderBy: { completedAt: 'desc' } }),
    db.mistake.count({ where: { studentId } }),
  ]);
  return { results, mistakeCount };
}

// ============================================
// Listening sessions
// ============================================

export async function createListeningSession(data: Prisma.ListeningSessionCreateInput) {
  return db.listeningSession.create({ data });
}
