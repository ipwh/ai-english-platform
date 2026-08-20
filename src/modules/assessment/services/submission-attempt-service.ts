// ============================================
// R3.5 hardening: atomic assignment submission service
// ============================================
// Route → service → repository. One transaction writes:
//   1. Submission compatibility view (latest execution)
//   2. SubmissionAttempt (append-only execution identity)
//   3. SubmissionAnswer rows (per-item evidence)
// If any write fails the whole transaction rolls back — a compatibility
// view can never commit without its corresponding attempt evidence.
//
// Attempt numbering is concurrency-safe: the Submission row is locked
// (SELECT ... FOR UPDATE) inside the transaction before counting, so
// concurrent submissions for the same submission serialize on the lock
// and @@unique([submissionId, attemptNumber]) is never violated by this
// code path.
// ============================================

import {
  withSubmissionTransaction,
  findSubmissionByAssignmentStudentTx,
  createSubmissionTx,
  updateSubmissionTx,
  lockSubmissionRowTx,
  countSubmissionAttemptsTx,
  createSubmissionAttemptTx,
  createSubmissionAnswerRowsTx,
} from '../repositories/assessment-repo';
import type { Prisma } from '@prisma/client';

export interface SubmitAssignmentAttemptInput {
  assignmentId: string;
  studentId: string;
  /** Raw client answers JSON — stored verbatim in the compatibility view */
  answersJson: string;
  score: number;
  aiFeedback: string;
  submittedAt: Date;
  /** Per-item evidence WITHOUT attemptId (attached inside the transaction) */
  items: Array<Omit<Prisma.SubmissionAnswerCreateManyInput, 'attemptId'>>;
}

export interface SubmitAssignmentAttemptResult {
  submission: { id: string };
  attempt: { id: string; attemptNumber: number };
  /** true when this is the student's first submission for the assignment */
  isNew: boolean;
}

/**
 * Prisma unique-violation detection (P2002) — structural check so no runtime
 * class import is required.
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

/**
 * True ONLY when the P2002 came from the Submission composite unique
 * (assignmentId + studentId). Other unique violations (e.g. attemptNumber)
 * must NOT trigger the retry — they indicate a different kind of bug.
 */
function isSubmissionUniqueViolation(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false;
  const meta = (err as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  const fields: string[] = Array.isArray(target)
    ? (target as string[])
    : typeof target === 'string'
      ? [target]
      : [];
  return fields.includes('assignmentId') && fields.includes('studentId');
}

export async function submitAssignmentAttempt(
  input: SubmitAssignmentAttemptInput,
): Promise<SubmitAssignmentAttemptResult> {
  try {
    return await submitAttemptTx(input);
  } catch (err) {
    // R3.10-K Step 6 (DB-001): with @@unique([assignmentId, studentId]), a
    // concurrent first submission can lose the create race with P2002. The
    // failed transaction has rolled back entirely, so a single retry simply
    // finds the now-existing canonical row and appends the attempt to it.
    if (isSubmissionUniqueViolation(err)) {
      return await submitAttemptTx(input);
    }
    throw err;
  }
}

async function submitAttemptTx(
  input: SubmitAssignmentAttemptInput,
): Promise<SubmitAssignmentAttemptResult> {
  return withSubmissionTransaction(async tx => {
    const existing = await findSubmissionByAssignmentStudentTx(
      tx,
      input.assignmentId,
      input.studentId,
    );

    const submission = existing
      ? await updateSubmissionTx(tx, existing.id, {
          answers: input.answersJson,
          score: input.score,
          aiFeedback: input.aiFeedback,
          status: 'submitted',
          submittedAt: input.submittedAt,
        })
      : await createSubmissionTx(tx, {
          assignmentId: input.assignmentId,
          studentId: input.studentId,
          answers: input.answersJson,
          score: input.score,
          aiFeedback: input.aiFeedback,
          status: 'submitted',
          submittedAt: input.submittedAt,
        });

    // 序列化並發提交：鎖定該列後再計數，保證 attemptNumber 不會重複
    await lockSubmissionRowTx(tx, submission.id);
    const attemptCount = await countSubmissionAttemptsTx(tx, submission.id);
    const attempt = await createSubmissionAttemptTx(tx, {
      submissionId: submission.id,
      attemptNumber: attemptCount + 1,
      score: input.score,
      aiFeedback: input.aiFeedback,
      submittedAt: input.submittedAt,
    });

    if (input.items.length > 0) {
      await createSubmissionAnswerRowsTx(
        tx,
        input.items.map(item => ({ ...item, attemptId: attempt.id })),
      );
    }

    return { submission, attempt, isNew: !existing };
  });
}
