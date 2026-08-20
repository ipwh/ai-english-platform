// ============================================
// DB-001 — Submission uniqueness: P2002 retry behavior + contract checks
//
// - The retry path proves the write logic recovers from a concurrent-first-
//   submission unique violation and appends the attempt to the canonical row.
// - The schema/migration contract tests prove the DB-level guarantee exists.
// - Real-Postgres concurrency coverage lives in
//   submission-concurrency.integration.test.ts (gated on TEST_DATABASE_URL).
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  submissions: [] as Array<Record<string, unknown>>,
  attempts: [] as Array<Record<string, unknown>>,
  failNextCreate: false,
  throwNext: null as Error | null,
  createCount: 0,
}));

vi.mock('@/modules/assessment/repositories/assessment-repo', () => ({
  withSubmissionTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({}),
  findSubmissionByAssignmentStudentTx: async (
    _tx: unknown, assignmentId: string, studentId: string,
  ) => state.submissions.find(s => s.assignmentId === assignmentId && s.studentId === studentId) ?? null,
  createSubmissionTx: async (_tx: unknown, data: Record<string, unknown>) => {
    state.createCount += 1;
    if (state.throwNext) {
      const thrown = state.throwNext;
      state.throwNext = null;
      throw thrown;
    }
    if (state.failNextCreate) {
      state.failNextCreate = false;
      const err = new Error('Unique constraint failed on the fields: (`assignmentId`,`studentId`)');
      Object.assign(err, { code: 'P2002', meta: { target: ['assignmentId', 'studentId'] } });
      throw err;
    }
    const sub = { id: `sub-${state.submissions.length + 1}`, ...data };
    state.submissions.push(sub);
    return sub;
  },
  updateSubmissionTx: async (_tx: unknown, id: string, data: Record<string, unknown>) => {
    const sub = state.submissions.find(s => s.id === id)!;
    Object.assign(sub, data);
    return sub;
  },
  lockSubmissionRowTx: async () => {},
  countSubmissionAttemptsTx: async (_tx: unknown, submissionId: string) =>
    state.attempts.filter(a => a.submissionId === submissionId).length,
  createSubmissionAttemptTx: async (_tx: unknown, data: Record<string, unknown>) => {
    const attempt = { id: `att-${state.attempts.length + 1}`, ...data };
    state.attempts.push(attempt);
    return attempt;
  },
  createSubmissionAnswerRowsTx: async () => ({ count: 0 }),
}));

import { submitAssignmentAttempt } from '../services/submission-attempt-service';

function makeInput() {
  return {
    assignmentId: 'asg-1',
    studentId: 'stu-1',
    answersJson: '{}',
    score: 80,
    aiFeedback: '',
    submittedAt: new Date('2026-08-19T10:00:00Z'),
    items: [],
  };
}

beforeEach(() => {
  state.submissions = [];
  state.attempts = [];
  state.failNextCreate = false;
  state.throwNext = null;
  state.createCount = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('submitAssignmentAttempt — unique-constraint retry', () => {
  it('first submission creates the canonical row', async () => {
    const result = await submitAssignmentAttempt(makeInput());
    expect(result.isNew).toBe(true);
    expect(state.submissions).toHaveLength(1);
    expect(state.attempts).toHaveLength(1);
  });

  it('recovers from a concurrent-create P2002 by attaching to the existing row', async () => {
    // Simulate the race: another request has ALREADY committed the canonical
    // row, and our create collides with the unique constraint.
    state.submissions.push({
      id: 'sub-winner',
      assignmentId: 'asg-1',
      studentId: 'stu-1',
      answers: '{}',
      score: 75,
      status: 'submitted',
    });
    state.attempts.push({ id: 'att-winner', submissionId: 'sub-winner', attemptNumber: 1 });
    state.failNextCreate = true;

    const result = await submitAssignmentAttempt(makeInput());

    // Exactly one canonical submission remains; the new attempt was appended
    // to the winner's row with the next attempt number.
    expect(state.submissions).toHaveLength(1);
    expect(result.submission.id).toBe('sub-winner');
    expect(result.isNew).toBe(false);
    expect(result.attempt.attemptNumber).toBe(2);
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[1].submissionId).toBe('sub-winner');
  });

  it('propagates non-P2002 errors untouched (no retry)', async () => {
    state.throwNext = new Error('db down');
    await expect(submitAssignmentAttempt(makeInput())).rejects.toThrow('db down');
    // No retry happened for a non-unique error.
    expect(state.createCount).toBe(1);
  });

  it('does NOT retry on unrelated P2002 (e.g. attemptNumber)', async () => {
    // A unique violation on a different constraint must not trigger the
    // submission retry — the whole transaction rejects exactly once.
    state.throwNext = Object.assign(
      new Error('Unique constraint failed on the fields: (`submissionId`,`attemptNumber`)'),
      { code: 'P2002', meta: { target: ['submissionId', 'attemptNumber'] } },
    );
    await expect(submitAssignmentAttempt(makeInput())).rejects.toThrow();
    expect(state.createCount).toBe(1);
  });
});

describe('DB-001 — schema & migration contracts', () => {
  it('prisma schema enforces @@unique([assignmentId, studentId]) on Submission', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf-8');
    const submissionBlock = schema.match(/model Submission \{[\s\S]*?\n\}/)?.[0];
    expect(submissionBlock).toBeTruthy();
    expect(submissionBlock).toContain('@@unique([assignmentId, studentId])');
  });

  it('migration deduplicates deterministically and creates the unique index', () => {
    const sql = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260819_submission_unique_assignment_student/migration.sql'),
      'utf-8',
    );
    // No silent data loss: attempts are reassigned before duplicate rows are removed.
    expect(sql).toContain('UPDATE "SubmissionAttempt"');
    expect(sql).toContain('DELETE FROM "Submission"');
    expect(sql).toContain('CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key"');
    // Auditability: keep earliest row, tie-break by id.
    expect(sql).toContain('ORDER BY "createdAt" ASC, id ASC');
  });
});
