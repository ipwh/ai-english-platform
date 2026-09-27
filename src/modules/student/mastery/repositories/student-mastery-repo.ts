// Sprint 31: Student Mastery Repository
import { db } from '@/shared/db/db';
import type { MasterySkill, MasterySubSkill } from '../types';
import { calculateMasteryScore } from '../services/mastery-formula';

/** Get all mastery entries for a student */
export async function getStudentMastery(studentId: string) {
  return db.studentMastery.findMany({
    where: { studentId },
    orderBy: { masteryScore: 'asc' },
  });
}

/** Get mastery for a specific skill / sub-skill */
export async function getMasteryEntry(
  studentId: string,
  skill: MasterySkill,
  subSkill: MasterySubSkill,
) {
  return db.studentMastery.findUnique({
    where: { studentId_skill_subSkill: { studentId, skill, subSkill } },
  });
}

/** Upsert mastery entry — creates or updates */
export async function upsertMastery(params: {
  studentId: string;
  skill: MasterySkill;
  subSkill: MasterySubSkill;
  masteryScore: number;
  confidenceScore: number;
  retentionScore: number;
}) {
  const { studentId, skill, subSkill, masteryScore, confidenceScore, retentionScore } = params;
  return db.studentMastery.upsert({
    where: { studentId_skill_subSkill: { studentId, skill, subSkill } },
    create: { studentId, skill, subSkill, masteryScore, confidenceScore, retentionScore },
    update: { masteryScore, confidenceScore, retentionScore, updatedAt: new Date() },
  });
}

/** Record a practice attempt (correct or incorrect) */
export async function recordPracticeAttempt(params: {
  studentId: string;
  skill: MasterySkill;
  subSkill: MasterySubSkill;
  isCorrect: boolean;
}) {
  const { studentId, skill, subSkill, isCorrect } = params;
  const now = new Date();

  // Try to update existing, if not found create with defaults
  const existing = await getMasteryEntry(studentId, skill, subSkill);
  if (existing) {
    return db.studentMastery.update({
      where: { studentId_skill_subSkill: { studentId, skill, subSkill } },
      data: {
        practiceCount: { increment: 1 },
        correctCount: isCorrect ? { increment: 1 } : undefined,
        mistakeCount: isCorrect ? undefined : { increment: 1 },
        lastPracticedAt: now,
      },
    });
  }
  return db.studentMastery.create({
    data: {
      studentId, skill, subSkill,
      masteryScore: 0, confidenceScore: 0, retentionScore: 0,
      practiceCount: 1,
      correctCount: isCorrect ? 1 : 0,
      mistakeCount: isCorrect ? 0 : 1,
      lastPracticedAt: now,
    },
  });
}

/**
 * 2026-09-26 晚上事故：互動交易護欄（等待連線與總時長上限），
 * 避免高併發時交易堆叠佔滿連線池。
 */
const MASTERY_TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

/** Apply one persisted practice session to mastery exactly once. */
export async function applyPracticeMasteryOnce(params: {
  sessionId: string;
  studentId: string;
  skill: MasterySkill;
  subSkill: MasterySubSkill;
  totalQuestions: number;
  correctCount: number;
}): Promise<boolean> {
  const isCorrect = params.correctCount >= Math.ceil(params.totalQuestions / 2);
  const now = new Date();

  return db.$transaction(async tx => {
    const claimed = await tx.practiceSession.updateMany({
      where: { id: params.sessionId, masteryAppliedAt: null },
      data: { masteryAppliedAt: now },
    });
    if (claimed.count === 0) return false;

    const existing = await tx.studentMastery.findUnique({
      where: { studentId_skill_subSkill: {
        studentId: params.studentId, skill: params.skill, subSkill: params.subSkill,
      } },
    });
    const entry = existing
      ? await tx.studentMastery.update({
          where: { studentId_skill_subSkill: {
            studentId: params.studentId, skill: params.skill, subSkill: params.subSkill,
          } },
          data: {
            practiceCount: { increment: 1 },
            correctCount: isCorrect ? { increment: 1 } : undefined,
            mistakeCount: isCorrect ? undefined : { increment: 1 },
            lastPracticedAt: now,
          },
        })
      : await tx.studentMastery.create({
          data: {
            studentId: params.studentId, skill: params.skill, subSkill: params.subSkill,
            masteryScore: 0, confidenceScore: 0, retentionScore: 0,
            practiceCount: 1, correctCount: isCorrect ? 1 : 0,
            mistakeCount: isCorrect ? 0 : 1, lastPracticedAt: now,
          },
        });
    const scores = calculateMasteryScore({
      correctCount: entry.correctCount, practiceCount: entry.practiceCount,
      mistakeCount: entry.mistakeCount, lastPracticedAt: entry.lastPracticedAt,
    });
    await tx.studentMastery.update({
      where: { studentId_skill_subSkill: {
        studentId: params.studentId, skill: params.skill, subSkill: params.subSkill,
      } },
      data: { ...scores, updatedAt: now },
    });
    return true;
  }, MASTERY_TX_OPTIONS);
}

/** Get weakest skills (lowest mastery, minimum 1 practice) */
export async function getWeakestSkills(studentId: string, limit = 5) {
  return db.studentMastery.findMany({
    where: { studentId, practiceCount: { gt: 0 } },
    orderBy: { masteryScore: 'asc' },
    take: limit,
  });
}

/** Get strongest skills (highest mastery) */
export async function getStrongestSkills(studentId: string, limit = 5) {
  return db.studentMastery.findMany({
    where: { studentId, practiceCount: { gt: 0 } },
    orderBy: { masteryScore: 'desc' },
    take: limit,
  });
}

/** Get mastery grouped by skill category */
export async function getMasteryBySkill(studentId: string) {
  return db.studentMastery.findMany({
    where: { studentId },
    orderBy: { skill: 'asc' },
  });
}
