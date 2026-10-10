// ============================================
// DB-001 — REAL PostgreSQL concurrency integration test
//
// Proves that two truly simultaneous first submissions for the same
// (assignmentId, studentId) produce EXACTLY ONE canonical Submission row
// (the P2002 retry attaches the second attempt to the winner's row).
//
// GATED: runs only when TEST_DATABASE_URL is set (CI with a Postgres
// service). It is skipped in the default local/unit environment — this is
// an explicit integration gate, not a way to hide a failure.
// ============================================

import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { databaseGate } from '@/shared/__tests__/database-gate';

// Imports are lazy (inside beforeAll) so the skipped suite never loads the
// Prisma adapter in environments without TEST_DATABASE_URL.
type DbClient = typeof import('@/shared/db/db')['db'];
type SubmitFn = typeof import('../services/submission-attempt-service')['submitAssignmentAttempt'];

const ENABLED = databaseGate(
  Boolean(process.env.TEST_DATABASE_URL),
  'DB-001 concurrent first submission',
);

describe.skipIf(!ENABLED)('DB-001 real-Postgres concurrent first submission', () => {
  let db: DbClient;
  let submitAssignmentAttempt: SubmitFn;
  let teacherId: string;
  let studentId: string;
  let assignmentId: string;

  beforeAll(async () => {
    ({ db } = await import('@/shared/db/db'));
    ({ submitAssignmentAttempt } = await import('../services/submission-attempt-service'));
    const email = `integration-${Date.now()}@test.local`;
    const teacher = await db.user.create({ data: { email: `teacher-${email}`, role: 'teacher' } });
    const student = await db.user.create({ data: { email: `student-${email}`, role: 'student' } });
    teacherId = teacher.id;
    studentId = student.id;
    const assignment = await db.assignment.create({
      data: {
        title: 'Integration submission test',
        gradeLevel: 'S4',
        strand: 'Writing',
        difficulty: 'Medium',
        createdBy: teacherId,
      },
    });
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    if (assignmentId) await db.assignment.delete({ where: { id: assignmentId } }).catch(() => {});
    if (studentId) await db.user.delete({ where: { id: studentId } }).catch(() => {});
    if (teacherId) await db.user.delete({ where: { id: teacherId } }).catch(() => {});
  });

  it('two simultaneous first submissions yield exactly one Submission row', async () => {
    const input = () => ({
      assignmentId,
      studentId,
      answersJson: JSON.stringify({ q1: 'answer' }),
      score: 80,
      aiFeedback: '',
      submittedAt: new Date(),
      items: [],
    });

    const results = await Promise.allSettled([
      submitAssignmentAttempt(input()),
      submitAssignmentAttempt(input()),
    ]);

    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    const submissions = await db.submission.findMany({ where: { assignmentId, studentId } });
    expect(submissions).toHaveLength(1);

    const attempts = await db.submissionAttempt.findMany({ where: { submissionId: submissions[0].id } });
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts.map(a => a.attemptNumber)).size).toBe(2);
  });
});
