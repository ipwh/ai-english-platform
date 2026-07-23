// Sprint 31: Student Mastery Repository
import { db } from '@/shared/db/db';
import type { MasterySkill, MasterySubSkill } from '../types';

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
