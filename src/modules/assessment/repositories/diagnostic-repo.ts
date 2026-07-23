// v5: Diagnostic Repository — data access for diagnostic results
import { db } from '@/shared/db/db';

export async function clearDiagnosticResults(studentId: string) {
  return db.diagnosticResult.deleteMany({ where: { studentId } });
}

export async function createDiagnosticResult(data: {
  studentId: string; skill: string; skillZh: string; accuracy: number;
  weakAreas: string[]; recommendedGrammar?: string | null;
  recommendedSkill?: string | null;
}) {
  return db.diagnosticResult.create({
    data: {
      studentId: data.studentId,
      skill: data.skill,
      skillZh: data.skillZh,
      accuracy: data.accuracy,
      weakAreas: JSON.stringify(data.weakAreas || []),
      recommendedGrammar: data.recommendedGrammar ?? null,
      recommendedSkill: data.recommendedSkill ?? null,
      completedAt: new Date(),
    },
  });
}

export async function getRecentDiagnostics(studentId: string, limit = 5) {
  return db.diagnosticResult.findMany({
    where: { studentId },
    select: { weakAreas: true, recommendedGrammar: true, accuracy: true },
    orderBy: { completedAt: 'desc' },
    take: limit,
  });
}

export async function createFeedback(data: {
  userId: string; type: string; payload: Record<string, unknown>;
}) {
  return db.feedback.create({
    data: {
      userId: data.userId,
      type: data.type,
      payload: JSON.stringify(data.payload || {}),
    },
  });
}
