// ============================================
// IELTS concurrency invariants — REAL PostgreSQL integration test
// (2026-10-08, Sprint 131)
//
// Proves that the DATABASE — not an application-level read-check-write —
// enforces the three IELTS invariants:
//
//   F1  the daily on-demand generation cap cannot be exceeded by concurrent
//       requests (atomic conditional reservation)
//   F2  a (student, test) pair can never have two ACTIVE attempts
//       (unique `IeltsAttempt.activeKey`)
//   F3  a submission finalises EXACTLY ONCE (conditional status transition +
//       response rows in one transaction)
//
// GATED: runs only when TEST_DATABASE_URL is set (CI runs it against the
// Postgres service). It is skipped in the default local/unit environment — an
// explicit integration gate, not a way to hide a failure. Imports are lazy so a
// skipped suite never constructs the Prisma adapter.
// ============================================

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { hkDayKey, hkDaysAgo } from '@/shared/utils/hk-date';
import { databaseGate } from '@/shared/__tests__/database-gate';

type DbClient = typeof import('@/shared/db/db')['db'];
type Repo = typeof import('../repositories/ielts-repo');
type AttemptService = typeof import('../services/attempt-service');
type RetentionService = typeof import('../services/quota-retention-service');

const ENABLED = databaseGate(
  Boolean(process.env.TEST_DATABASE_URL),
  'IELTS concurrency + retention invariants',
);
// The Prisma client is constructed from DATABASE_URL; the gate above uses
// TEST_DATABASE_URL (the documented convention in this repo).
if (ENABLED && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

describe.skipIf(!ENABLED)('IELTS concurrency invariants (real Postgres)', () => {
  let db: DbClient;
  let repo: Repo;
  let attemptService: AttemptService;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let studentId: string;
  let testId: string;
  let questionId: string;

  beforeAll(async () => {
    ({ db } = await import('@/shared/db/db'));
    repo = await import('../repositories/ielts-repo');
    attemptService = await import('../services/attempt-service');

    const student = await db.user.create({
      data: { email: `ielts-concurrency-${runId}@test.local`, role: 'student' },
    });
    studentId = student.id;

    const test = await db.ieltsTest.create({
      data: {
        slug: `concurrency-${runId}`,
        title: 'Concurrency fixture',
        testType: 'ACADEMIC',
        skill: 'READING',
        status: 'PUBLISHED',
        origin: 'CATALOGUE',
      },
    });
    testId = test.id;

    const section = await db.ieltsSection.create({
      data: {
        testId,
        orderIndex: 0,
        label: 'Passage 1',
        passageText: 'Alpha appears first in the passage. Beta appears second.',
        wordCount: 9,
      },
    });

    const question = await db.ieltsQuestion.create({
      data: {
        testId,
        sectionId: section.id,
        orderIndex: 0,
        questionType: 'reading_multiple_choice',
        skill: 'READING',
        prompt: 'Which comes first?',
        options: JSON.stringify(['Alpha', 'Beta', 'Gamma', 'Delta']),
        answerKey: JSON.stringify('A'),
        validationStatus: 'PUBLISHED',
      },
    });
    questionId = question.id;
  });

  afterAll(async () => {
    // IeltsTest cascades to sections / questions / attempts / responses.
    if (testId) await db.ieltsTest.delete({ where: { id: testId } }).catch(() => {});
    if (studentId) {
      await db.ieltsGenerationQuota.deleteMany({ where: { ownerUserId: studentId } }).catch(() => {});
      await db.user.delete({ where: { id: studentId } }).catch(() => {});
    }
  });

  // ---------------------------------------------------------------
  // F1 — atomic daily generation quota
  // ---------------------------------------------------------------
  describe('F1 — daily generation quota is atomic', () => {
    const CAP = 8;
    const dayKey = `1970-01-01-${runId}`; // isolated, no HKT rollover during the run

    it('10 concurrent reservations against a cap of 8 grant EXACTLY 8', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          repo.reserveInstantQuota({
            ownerUserId: studentId,
            dayKey,
            bucket: 'set',
            cap: CAP,
          }),
        ),
      );

      const granted = results.filter((r) => r.reserved);
      expect(granted).toHaveLength(CAP);

      // The authoritative counter — read straight from the database.
      const used = await repo.readInstantQuotaUsed({
        ownerUserId: studentId,
        dayKey,
        bucket: 'set',
      });
      expect(used).toBe(CAP);

      // Exactly one row exists (the unique (owner, day, bucket) index held).
      const rows = await db.ieltsGenerationQuota.findMany({
        where: { ownerUserId: studentId, dayKey },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].usedCount).toBe(CAP);
    });

    // Certification (2026-10-09, Sprint 133) — Test A of the release audit.
    // A 20-request burst is the strongest shape available from a single process
    // and it must satisfy BOTH sides of the invariant:
    //   SAFETY    — never more than the cap   (grants <= 8)
    //   LIVENESS  — never fewer than the cap  (grants == 8) when capacity exists
    // A regression that under-grants (measured 2026-10-08: 10 requests granted 6)
    // fails the liveness half just as loudly as an over-grant fails safety.
    it('grants EXACTLY the cap under a 20-request burst (safety AND liveness)', async () => {
      const day = `1970-01-07-${runId}`;
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          repo.reserveInstantQuota({
            ownerUserId: studentId,
            dayKey: day,
            bucket: 'set',
            cap: CAP,
          }),
        ),
      );

      const granted = results.filter((r) => r.reserved);
      expect(granted).toHaveLength(CAP); // <= CAP (safety) AND >= CAP (liveness)

      // The counter the database actually holds must agree with the grants.
      expect(
        await repo.readInstantQuotaUsed({ ownerUserId: studentId, dayKey: day, bucket: 'set' }),
      ).toBe(CAP);

      const rows = await db.ieltsGenerationQuota.findMany({
        where: { ownerUserId: studentId, dayKey: day },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].usedCount).toBe(CAP);

      // Every refusal must be authoritative (the true count, never a guess).
      for (const r of results.filter((x) => !x.reserved)) {
        expect(r.usedCount).toBe(CAP);
      }
    });

    it('the 9th request of a fresh day is refused (and the cap is exactly 8)', async () => {
      const freshDay = `1970-01-02-${runId}`;
      const reserved: boolean[] = [];
      for (let i = 0; i < 9; i++) {
        const r = await repo.reserveInstantQuota({
          ownerUserId: studentId,
          dayKey: freshDay,
          bucket: 'set',
          cap: CAP,
        });
        reserved.push(r.reserved);
      }
      expect(reserved.filter(Boolean)).toHaveLength(CAP);
      expect(reserved[CAP]).toBe(false);
    });

    it('releasing a reservation frees exactly one slot', async () => {
      const day = `1970-01-03-${runId}`;
      const a = await repo.reserveInstantQuota({
        ownerUserId: studentId, dayKey: day, bucket: 'set', cap: 1,
      });
      const b = await repo.reserveInstantQuota({
        ownerUserId: studentId, dayKey: day, bucket: 'set', cap: 1,
      });
      expect(a.reserved).toBe(true);
      expect(b.reserved).toBe(false);

      await repo.releaseInstantQuota({ ownerUserId: studentId, dayKey: day, bucket: 'set' });

      const c = await repo.reserveInstantQuota({
        ownerUserId: studentId, dayKey: day, bucket: 'set', cap: 1,
      });
      expect(c.reserved).toBe(true);
    });

    it('buckets are independent (a component never consumes the set budget)', async () => {
      const day = `1970-01-04-${runId}`;
      await repo.reserveInstantQuota({
        ownerUserId: studentId, dayKey: day, bucket: 'full_component', cap: 2,
      });
      const setReservation = await repo.reserveInstantQuota({
        ownerUserId: studentId, dayKey: day, bucket: 'set', cap: 8,
      });
      expect(setReservation.reserved).toBe(true);
      expect(setReservation.usedCount).toBe(1);
    });

    // Regression guard (2026-10-08, Sprint 132): an earlier loop-free rewrite of
    // `reserveInstantQuota` refused a valid slot whenever the row APPEARED
    // between its failed conditional UPDATE and the follow-up read — i.e. the
    // very first INSERT race, which is exactly this shape. Measured: 10
    // concurrent reservations from zero granted only 6 of 8.
    it('grants the LAST available slot exactly once when starting from cap-1', async () => {
      const day = `1970-01-05-${runId}`;
      const cap = 4;
      // Pre-create the row sitting one slot below the cap.
      await db.ieltsGenerationQuota.create({
        data: { ownerUserId: studentId, dayKey: day, bucket: 'set', usedCount: cap - 1 },
      });

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          repo.reserveInstantQuota({ ownerUserId: studentId, dayKey: day, bucket: 'set', cap }),
        ),
      );

      expect(results.filter((r) => r.reserved)).toHaveLength(1);
      expect(
        await repo.readInstantQuotaUsed({ ownerUserId: studentId, dayKey: day, bucket: 'set' }),
      ).toBe(cap);
      // Every refusal must report the authoritative count, not a guess.
      for (const r of results.filter((x) => !x.reserved)) {
        expect(r.usedCount).toBe(cap);
      }
    });

    it('never grants more than the cap (10 requests, cap 1, no pre-existing row)', async () => {
      const day = `1970-01-06-${runId}`;
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          repo.reserveInstantQuota({ ownerUserId: studentId, dayKey: day, bucket: 'set', cap: 1 }),
        ),
      );

      expect(results.filter((r) => r.reserved)).toHaveLength(1);
      expect(
        await repo.readInstantQuotaUsed({ ownerUserId: studentId, dayKey: day, bucket: 'set' }),
      ).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // F2 — single active attempt per (student, test)
  // ---------------------------------------------------------------
  describe('F2 — attempt creation is concurrency safe', () => {
    let concurrentTestId: string;

    beforeAll(async () => {
      const test = await db.ieltsTest.create({
        data: {
          slug: `concurrency-start-${runId}`,
          title: 'Start race fixture',
          testType: 'ACADEMIC',
          skill: 'READING',
          status: 'PUBLISHED',
          origin: 'CATALOGUE',
        },
      });
      concurrentTestId = test.id;
    });

    afterAll(async () => {
      if (concurrentTestId) {
        await db.ieltsTest.delete({ where: { id: concurrentTestId } }).catch(() => {});
      }
    });

    it('two simultaneous starts yield EXACTLY ONE IN_PROGRESS attempt', async () => {
      const [a, b] = await Promise.all([
        attemptService.startIeltsAttempt({ userId: studentId, testId: concurrentTestId }),
        attemptService.startIeltsAttempt({ userId: studentId, testId: concurrentTestId }),
      ]);

      // Both callers must receive a coherent result (same attempt).
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.data.id).toBe(b.data.id);

      const attempts = await db.ieltsAttempt.findMany({
        where: { userId: studentId, testId: concurrentTestId },
      });
      expect(attempts.filter((x) => x.status === 'IN_PROGRESS')).toHaveLength(1);
      expect(attempts).toHaveLength(1);

      // A later sequential start RESUMES the same attempt (no new row).
      const resumed = await attemptService.startIeltsAttempt({
        userId: studentId,
        testId: concurrentTestId,
      });
      expect(resumed.ok).toBe(true);
      if (resumed.ok) expect(resumed.data.id).toBe(a.data.id);
    });

    it('force=true retakes by retiring the active attempt (still one active)', async () => {
      const first = await attemptService.startIeltsAttempt({
        userId: studentId,
        testId: concurrentTestId,
      });
      expect(first.ok).toBe(true);

      const retake = await attemptService.startIeltsAttempt({
        userId: studentId,
        testId: concurrentTestId,
        force: true,
      });
      expect(retake.ok).toBe(true);

      const attempts = await db.ieltsAttempt.findMany({
        where: { userId: studentId, testId: concurrentTestId },
      });
      expect(attempts.filter((x) => x.status === 'IN_PROGRESS')).toHaveLength(1);
      if (first.ok && retake.ok) expect(retake.data.id).not.toBe(first.data.id);
    });
  });

  // ---------------------------------------------------------------
  // F3 — submission finalises exactly once
  // ---------------------------------------------------------------
  describe('F3 — submission is atomic', () => {
    function correctAnswer() {
      return [{ questionId, answer: 'A' }];
    }
    function wrongAnswer() {
      return [{ questionId, answer: 'B' }];
    }

    it('two identical concurrent submissions finalise EXACTLY ONCE', async () => {
      const start = await attemptService.startIeltsAttempt({
        userId: studentId,
        testId,
        force: true,
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const attemptId = start.data.id;

      const results = await Promise.all([
        attemptService.submitIeltsAttempt({ userId: studentId, attemptId, answers: correctAnswer() }),
        attemptService.submitIeltsAttempt({ userId: studentId, attemptId, answers: correctAnswer() }),
      ]);

      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      for (const loser of losers) {
        if (!loser.ok) expect(loser.status).toBe(409);
      }

      const attempts = await db.ieltsAttempt.findMany({ where: { id: attemptId } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe('SUBMITTED');
      // The active key is released so the pair is free for a future retake.
      expect(attempts[0].activeKey).toBeNull();

      const responses = await db.ieltsResponse.findMany({ where: { attemptId } });
      expect(responses).toHaveLength(1);
      expect(responses[0].verdict).toBe('correct');
    });

    it('two DIFFERENT concurrent submissions produce ONE internally consistent result', async () => {
      const start = await attemptService.startIeltsAttempt({
        userId: studentId,
        testId,
        force: true,
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const attemptId = start.data.id;

      const results = await Promise.all([
        attemptService.submitIeltsAttempt({ userId: studentId, attemptId, answers: correctAnswer() }),
        attemptService.submitIeltsAttempt({ userId: studentId, attemptId, answers: wrongAnswer() }),
      ]);

      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      for (const loser of losers) {
        if (!loser.ok) expect(loser.status).toBe(409);
      }

      const attempt = await db.ieltsAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      const responses = await db.ieltsResponse.findMany({ where: { attemptId } });
      // No mixed response set: exactly one row, and it agrees with the winner's
      // persisted score (the loser's transaction rolled back entirely).
      expect(responses).toHaveLength(1);
      const winner = winners[0];
      if (!winner.ok) return;
      const expectedCorrect = winner.data.rawScore;
      expect(attempt.rawScore).toBe(expectedCorrect);
      expect(responses[0].verdict).toBe(expectedCorrect === 1 ? 'correct' : 'incorrect');
    });

    it('a retry after submission is a deterministic 409 with no extra rows', async () => {
      const start = await attemptService.startIeltsAttempt({
        userId: studentId,
        testId,
        force: true,
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const attemptId = start.data.id;

      const first = await attemptService.submitIeltsAttempt({
        userId: studentId, attemptId, answers: correctAnswer(),
      });
      expect(first.ok).toBe(true);

      const retry = await attemptService.submitIeltsAttempt({
        userId: studentId, attemptId, answers: correctAnswer(),
      });
      expect(retry.ok).toBe(false);
      if (!retry.ok) {
        expect(retry.status).toBe(409);
        expect(retry.error).toContain('ATTEMPT_ALREADY_SUBMITTED');
      }

      const responses = await db.ieltsResponse.findMany({ where: { attemptId } });
      expect(responses).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // F4 — quota retention safety (2026-10-09, Sprint 133)
  // ---------------------------------------------------------------
  // `deleteInstantQuotaRowsOlderThan` is deliberately GLOBAL (it cleans the whole
  // table, not one owner), so these proofs live in this file rather than their
  // own: a second file running in parallel would both race the row counts and let
  // the cleanup delete the other file's fixtures mid-test. Assertions are scoped
  // to this suite's own rows so they stay exact.
  describe('F4 — quota retention safety', () => {
    let retention: RetentionService;
    /** 12:00 HKT on 2026-10-09 — a fixed instant so the cutoff is deterministic. */
    const NOW = new Date('2026-10-09T04:00:00.000Z');
    const CUTOFF = hkDaysAgo(30, NOW);

    beforeAll(async () => {
      retention = await import('../services/quota-retention-service');
    });

    const countDay = (dayKey: string) =>
      db.ieltsGenerationQuota.count({ where: { ownerUserId: studentId, dayKey } });

    it('removes ONLY rows strictly older than the cutoff, never the current day', async () => {
      const staleDay = hkDaysAgo(31, NOW); // strictly older  → must go
      const atCutoff = hkDaysAgo(30, NOW); // == cutoff       → must SURVIVE (strict lt)
      const recent = hkDaysAgo(1, NOW); // must survive
      const today = hkDayKey(NOW); // the LIVE counter  → must survive

      for (const dayKey of [staleDay, atCutoff, recent, today]) {
        await db.ieltsGenerationQuota.create({
          data: { ownerUserId: studentId, dayKey, bucket: 'retention-set', usedCount: 1 },
        });
      }

      const result = await retention.runIeltsQuotaRetention({}, { now: () => NOW });
      expect(result.cutoffDayKey).toBe(CUTOFF);

      expect(await countDay(staleDay)).toBe(0);
      expect(await countDay(atCutoff)).toBe(1);
      expect(await countDay(recent)).toBe(1);
      expect(await countDay(today)).toBe(1);
    });

    it('bounds each batch, drains the backlog, and is idempotent when re-run', async () => {
      const bulkDay = hkDaysAgo(40, NOW);
      const TOTAL = 1200;

      await db.ieltsGenerationQuota.createMany({
        data: Array.from({ length: TOTAL }, (_, i) => ({
          ownerUserId: studentId,
          dayKey: bulkDay,
          bucket: `retention-bulk-${i}`,
          usedCount: 1,
        })),
      });
      expect(await countDay(bulkDay)).toBe(TOTAL);

      // ONE repository call is bounded: it removes at most `batchSize` rows.
      const firstBatch = await repo.deleteInstantQuotaRowsOlderThan(CUTOFF, 500);
      expect(firstBatch).toBe(500);
      expect(await countDay(bulkDay)).toBe(TOTAL - 500);

      // A full run drains the remainder inside the round cap.
      const result = await retention.runIeltsQuotaRetention({}, { now: () => NOW });
      expect(await countDay(bulkDay)).toBe(0);
      expect(result.moreRemaining).toBe(false);
      expect(result.batches).toBeLessThanOrEqual(retention.IELTS_QUOTA_RETENTION_MAX_BATCHES);

      // Repeated execution is safe: nothing left for this day, no error reported.
      const again = await retention.runIeltsQuotaRetention({}, { now: () => NOW });
      expect(await countDay(bulkDay)).toBe(0);
      expect(again.moreRemaining).toBe(false);
    });

    it('a dry run counts the backlog and deletes nothing', async () => {
      const dryDay = hkDaysAgo(45, NOW);
      await db.ieltsGenerationQuota.createMany({
        data: [0, 1, 2].map((i) => ({
          ownerUserId: studentId,
          dayKey: dryDay,
          bucket: `retention-dry-${i}`,
          usedCount: 1,
        })),
      });

      const result = await retention.runIeltsQuotaRetention({ dryRun: true }, { now: () => NOW });

      expect(result.dryRun).toBe(true);
      expect(result.deletedRows).toBe(0);
      expect(result.batches).toBe(0);
      expect(result.wouldDelete).toBeGreaterThanOrEqual(3);
      expect(await countDay(dryDay)).toBe(3); // nothing removed
    });

    it('keeps a retention window of at least 30 Hong Kong days', () => {
      expect(retention.IELTS_QUOTA_RETENTION_DAYS).toBeGreaterThanOrEqual(30);
      expect(CUTOFF < hkDayKey(NOW)).toBe(true); // YYYY-MM-DD compares lexicographically
    });
  });
});
