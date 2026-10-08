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
  findSubmissionAttemptByClientIdTx,
  createSubmissionAttemptTx,
  createSubmissionAnswerRowsTx,
} from '../repositories/assessment-repo';
import { isUniqueViolationOn } from '@/shared/db/prisma-errors';
import type { Prisma } from '@prisma/client';

export interface SubmitAssignmentAttemptInput {
  assignmentId: string;
  studentId: string;
  /** Raw client answers JSON — stored verbatim in the compatibility view */
  answersJson: string;
  /** null = 未能自動評分（部分題目待老師批改）—— 不得以 0 冒充 */
  score: number | null;
  aiFeedback: string;
  submittedAt: Date;
  /** Stable client key for safely replaying a lost response. */
  clientSubmissionId?: string | null;
  /** Per-item evidence WITHOUT attemptId (attached inside the transaction) */
  items: Array<Omit<Prisma.SubmissionAnswerCreateManyInput, 'attemptId'>>;
}

export interface SubmitAssignmentAttemptResult {
  submission: { id: string };
  attempt: { id: string; attemptNumber: number };
  /** true when this is the student's first submission for the assignment */
  isNew: boolean;
  /** true when the same client execution had already committed */
  replayed: boolean;
}

/**
 * True ONLY when the P2002 came from the Submission composite unique
 * (assignmentId + studentId). Other unique violations (e.g. attemptNumber)
 * must NOT trigger the retry — they indicate a different kind of bug.
 *
 * 2026-10-08: the field list MUST be read through the shared helper. Prisma 7
 * (driver adapters / query compiler) no longer populates `meta.target`; it
 * reports `meta.driverAdapterError.cause.constraint.fields` with SQL-quoted
 * identifiers. Parsing `meta.target` here meant this predicate was ALWAYS false
 * on this Prisma version, so the DB-001 retry never fired and the losing request
 * of a concurrent first submission failed instead of attaching to the winner.
 */
function isSubmissionUniqueViolation(err: unknown): boolean {
  return isUniqueViolationOn(err, ['assignmentId', 'studentId']);
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

    if (existing) {
      await lockSubmissionRowTx(tx, existing.id);
      const clientSubmissionId = input.clientSubmissionId?.trim();
      if (clientSubmissionId) {
        const replay = await findSubmissionAttemptByClientIdTx(tx, existing.id, clientSubmissionId);
        if (replay) {
          return { submission: existing, attempt: replay, isNew: false, replayed: true };
        }
      }
    }

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

    // New submissions have no existing row to lock before creation.
    if (!existing) await lockSubmissionRowTx(tx, submission.id);
    const attemptCount = await countSubmissionAttemptsTx(tx, submission.id);
    const attempt = await createSubmissionAttemptTx(tx, {
      submissionId: submission.id,
      attemptNumber: attemptCount + 1,
      clientSubmissionId: input.clientSubmissionId?.trim() || null,
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

    return { submission, attempt, isNew: !existing, replayed: false };
  });
}
