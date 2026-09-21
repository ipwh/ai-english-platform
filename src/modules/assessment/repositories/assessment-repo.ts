import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export async function findAssignmentById(id: string) { return db.assignment.findUnique({ where: { id }, include: { questions: true, class: true } }); }
export async function listAssignments(filters?: Record<string, unknown>) { const where: Prisma.AssignmentWhereInput = {}; if (filters?.teacherId) where.createdBy = filters.teacherId as string; if (filters?.classId) where.classId = filters.classId as string; return db.assignment.findMany({ where, include: { class: { select: { name: true } }, _count: { select: { submissions: true } } }, orderBy: { createdAt: 'desc' } }); }
export async function getSubmissions(assignmentId: string) { return db.submission.findMany({ where: { assignmentId }, include: { student: { select: { id: true, name: true, nameZh: true } } }, orderBy: { submittedAt: 'desc' } }); }
export async function getStudentSubmission(assignmentId: string, studentId: string) { return db.submission.findFirst({ where: { assignmentId, studentId } }); }
export async function createSubmission(data: Prisma.SubmissionCreateInput) { return db.submission.create({ data }); }
export async function listMistakes(studentId: string) { return db.mistake.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }); }
export async function createMistake(data: Prisma.MistakeCreateInput) { return db.mistake.create({ data }); }
export async function listWritingDrafts(studentId: string) { return db.writingDraft.findMany({ where: { studentId }, orderBy: { updatedAt: 'desc' } }); }
export async function createWritingDraft(data: Prisma.WritingDraftCreateInput) { return db.writingDraft.create({ data }); }
export async function updateWritingDraft(id: string, data: Prisma.WritingDraftUpdateInput) { return db.writingDraft.update({ where: { id }, data }); }

// ============================================
// R3.5 hardening: atomic submission + attempt + evidence persistence
// ============================================
// All three writes (Submission compat view, SubmissionAttempt,
// SubmissionAnswer) commit or roll back together. Attempt numbering is
// made concurrency-safe by locking the Submission row (SELECT ... FOR
// UPDATE) inside the transaction BEFORE counting attempts.

/** Run a set of writes as one atomic transaction */
export async function withSubmissionTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(fn);
}

export async function findSubmissionByAssignmentStudentTx(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  studentId: string,
) {
  return tx.submission.findFirst({ where: { assignmentId, studentId } });
}

export async function createSubmissionTx(
  tx: Prisma.TransactionClient,
  data: Prisma.SubmissionUncheckedCreateInput,
) {
  return tx.submission.create({ data });
}

export async function updateSubmissionTx(
  tx: Prisma.TransactionClient,
  id: string,
  data: Prisma.SubmissionUncheckedUpdateInput,
) {
  return tx.submission.update({ where: { id }, data });
}

/**
 * Serialize concurrent submissions for the same Submission row. Acquires
 * a row lock so the attempt count below cannot race.
 */
export async function lockSubmissionRowTx(tx: Prisma.TransactionClient, submissionId: string) {
  await tx.$queryRaw`SELECT id FROM "Submission" WHERE id = ${submissionId} FOR UPDATE`;
}

/** Number of recorded attempts (call AFTER lockSubmissionRowTx) */
export async function countSubmissionAttemptsTx(tx: Prisma.TransactionClient, submissionId: string) {
  return tx.submissionAttempt.count({ where: { submissionId } });
}

export async function findSubmissionAttemptByClientIdTx(
  tx: Prisma.TransactionClient,
  submissionId: string,
  clientSubmissionId: string,
) {
  return tx.submissionAttempt.findFirst({ where: { submissionId, clientSubmissionId } });
}

export async function createSubmissionAttemptTx(
  tx: Prisma.TransactionClient,
  data: Prisma.SubmissionAttemptUncheckedCreateInput,
) {
  return tx.submissionAttempt.create({ data });
}

export async function createSubmissionAnswerRowsTx(
  tx: Prisma.TransactionClient,
  data: Prisma.SubmissionAnswerCreateManyInput[],
) {
  if (!data || data.length === 0) return { count: 0 };
  return tx.submissionAnswer.createMany({ data });
}
