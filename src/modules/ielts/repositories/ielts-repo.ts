// ============================================
// 2026-10-03 PHASE IELTS-01: IELTS Repository
// ============================================
// Data access for the isolated IELTS subsystem. Mirrors existing repository
// conventions (`@/shared/db/db`, typed Prisma input). Nothing here touches
// HKDSE tables.
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

// ============================================
// Catalogue
// ============================================

export async function createTest(data: Prisma.IeltsTestCreateInput) {
  return db.ieltsTest.create({ data });
}

export async function createSection(data: Prisma.IeltsSectionCreateInput) {
  return db.ieltsSection.create({ data });
}

export async function createQuestions(data: Prisma.IeltsQuestionCreateManyInput[]) {
  if (!data || data.length === 0) return { count: 0 };
  return db.ieltsQuestion.createMany({ data });
}

/** Single-question create (draft authoring — returns the created row with id). */
export async function createQuestion(data: Prisma.IeltsQuestionCreateInput) {
  return db.ieltsQuestion.create({ data });
}

/** Published CATALOGUE tests only — the delivery surface. Never exposes answer keys.
 * INSTANT (self-study) tests are owner-only and never listed, even once published.
 * Objective catalogue only (2026-10-03 XII): WRITING tasks are served through
 * the writing prompt bank (`listPublishedWritingTests`) and SPEAKING has no test
 * runner — a writing test must never appear here, or the dashboard would render
 * an objective "start" link for a task that cannot run. */
export async function listPublishedTests(filter: { testType?: string; skill?: string }) {
  return db.ieltsTest.findMany({
    where: {
      status: 'PUBLISHED',
      origin: 'CATALOGUE',
      skill: filter.skill ?? { in: ['READING', 'LISTENING'] },
      ...(filter.testType ? { testType: filter.testType } : {}),
    },
    orderBy: [{ testType: 'asc' }, { skill: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      testType: true,
      skill: true,
      description: true,
      durationMinutes: true,
      createdAt: true,
      // Only PUBLISHED questions are ever served — the count must match delivery
      // (a draft question added to a published test must not inflate the count).
      _count: { select: { sections: true, questions: { where: { validationStatus: 'PUBLISHED' } } } },
    },
  });
}

/** Total CATALOGUE tests (any status) — starter-content provisioning gate.
 * INSTANT self-study sets deliberately do not count: a student practising
 * on demand must never block the platform starter content from provisioning. */
export async function countTests() {
  return db.ieltsTest.count({ where: { origin: 'CATALOGUE' } });
}

/** Admin/teacher console: every test with its per-question status breakdown. */
export async function listTestsForAdmin() {
  return db.ieltsTest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      testType: true,
      skill: true,
      status: true,
      origin: true,
      createdAt: true,
      questions: { select: { validationStatus: true } },
    },
  });
}

/** Test detail WITHOUT answer keys (attempt-time view).
 * `questionStatuses` defaults to PUBLISHED (catalogue delivery). INSTANT
 * self-study delivery passes its own allow-list (QA_REQUIRED/HUMAN_APPROVED/
 * PUBLISHED — never DRAFT/REJECTED).
 *
 * FAIRNESS INVARIANT (2026-10-04): only questions ATTACHED TO A SECTION are
 * deliverable. A section-less question has no passage/transcript to reason from,
 * so the runner cannot display it — yet the scorer counts every deliverable
 * objective row, i.e. the student would silently lose a mark for a question they
 * never saw. Filtering here keeps delivery and scoring on the SAME rule
 * (`questionStatuses` + `sectionId != null`), because the submit path resolves
 * its rows from this same projection. */
export async function getTestForAttempt(
  testId: string,
  opts?: { questionStatuses?: string[] },
) {
  const questionStatuses = opts?.questionStatuses ?? ['PUBLISHED'];
  return db.ieltsTest.findUnique({
    where: { id: testId },
    include: {
      sections: { orderBy: { orderIndex: 'asc' } },
      questions: {
        where: { validationStatus: { in: questionStatuses }, sectionId: { not: null } },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          sectionId: true,
          orderIndex: true,
          questionType: true,
          skill: true,
          prompt: true,
          options: true,
          wordLimit: true,
          difficulty: true,
          // NOTE: answerKey / acceptedAnswers / evidence / explanation deliberately
          // excluded — no key material in attempt-time payloads.
        },
      },
    },
  });
}

/** Questions resolved by id (server-side scoring + admin). */
export async function findQuestionsByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  return db.ieltsQuestion.findMany({ where: { id: { in: ids } } });
}

export async function listQuestionsForAdmin(filter: { status?: string; skill?: string; testId?: string }) {
  return db.ieltsQuestion.findMany({
    where: {
      ...(filter.status ? { validationStatus: filter.status } : {}),
      ...(filter.skill ? { skill: filter.skill } : {}),
      ...(filter.testId ? { testId: filter.testId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function getQuestionById(id: string) {
  return db.ieltsQuestion.findUnique({ where: { id } });
}

export async function updateQuestionStatus(
  id: string,
  data: {
    validationStatus: string;
    validationNotes?: string;
    reviewedBy?: string | null;
    reviewedAt?: Date | null;
  },
) {
  return db.ieltsQuestion.update({ where: { id }, data });
}

// ============================================
// Generation support (2026-10-03 IV)
// ============================================

/** Recently used question prompts (dedupe material for generation). */
export async function listRecentQuestionPromptsBySkill(skill: string, take = 200) {
  return db.ieltsQuestion.findMany({
    where: { skill },
    orderBy: { createdAt: 'desc' },
    take,
    select: { prompt: true },
  });
}

/** Short excerpts of recent passages/transcripts (topic dedupe for generation). */
export async function listRecentSectionTextsBySkill(skill: string, take = 12) {
  return db.ieltsSection.findMany({
    where: { test: { skill } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { passageText: true, transcriptText: true },
  });
}

/** Recently used writing task prompts (dedupe material for writing generation). */
export async function listRecentWritingPrompts(testType: string, take = 30) {
  return db.ieltsQuestion.findMany({
    where: { skill: 'WRITING', test: { testType } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { prompt: true },
  });
}

/** Count of PUBLISHED writing tests (any origin) — writing-bank provisioning
 * gate (2026-10-03 XII): a subsystem that predates the writing starter content
 * only tops up when NO published writing prompt exists at all. */
export async function countPublishedWritingTests() {
  return db.ieltsTest.count({ where: { status: 'PUBLISHED', skill: 'WRITING' } });
}

/** Published WRITING tests with their (single) task section — prompt bank source. */
export async function listPublishedWritingTests(testType?: string) {
  return db.ieltsTest.findMany({
    where: {
      status: 'PUBLISHED',
      skill: 'WRITING',
      ...(testType ? { testType } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      testType: true,
      description: true,
      sections: { orderBy: { orderIndex: 'asc' }, select: { label: true, instructions: true } },
    },
  });
}

/** Batch status write used by the AI-generation pipeline (returns count). */
export async function updateQuestionsStatusForTest(
  testId: string,
  validationStatus: string,
  validationNotes?: string,
) {
  return db.ieltsQuestion.updateMany({
    where: { testId },
    data: {
      validationStatus,
      ...(validationNotes !== undefined ? { validationNotes } : {}),
    },
  });
}

/** Status update; INSTANT → PUBLISHED graduation also flips `origin` to
 * CATALOGUE so an approved self-study set joins the catalogue. */
export async function updateTestStatus(
  id: string,
  status: string,
  extra?: { origin?: string },
) {
  return db.ieltsTest.update({
    where: { id },
    data: { status, ...(extra?.origin ? { origin: extra.origin } : {}) },
  });
}

export async function getTestById(id: string) {
  return db.ieltsTest.findUnique({ where: { id } });
}

// ============================================
// On-demand generation quota (ATOMIC; 2026-10-08 Sprint 131)
// ============================================
//
// The daily cap is enforced by RESERVING a slot with a single conditional
// UPDATE, never by counting rows and comparing in application code:
//
//     UPDATE "IeltsGenerationQuota"
//        SET "usedCount" = "usedCount" + 1
//      WHERE "ownerUserId" = ? AND "dayKey" = ? AND "bucket" = ?
//        AND "usedCount" < cap
//
// Under READ COMMITTED the losing UPDATE re-evaluates the predicate against the
// winner's committed row, fails it, and reports 0 rows — so at most `cap`
// reservations can ever succeed, however many requests run concurrently.
// A `count()` → `if (count < cap)` check cannot provide that guarantee.

export type IeltsQuotaBucket = 'set' | 'full_component';

export interface IeltsQuotaReservation {
  /** True when this call owns a slot (the caller must generate or release). */
  reserved: boolean;
  /** Slots used AFTER this call (cap - usedCount = remaining). */
  usedCount: number;
}

/** Postgres/SQLite unique-violation detector (no Prisma runtime import needed). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Atomically reserve ONE on-demand generation slot, or report that the cap is
 * already reached. The caller MUST call {@link releaseInstantQuota} when the
 * generation does not produce a persisted test (see the service's policy note).
 *
 * Deliberately LOOP-FREE: the first-ever reservation of a (student, day, bucket)
 * racing on the unique index is resolved with a single INSERT plus at most one
 * conditional re-increment, so there is no per-iteration query (the N+1 source
 * checker rightly flags queries inside `for` loops).
 */
export async function reserveInstantQuota(args: {
  ownerUserId: string;
  dayKey: string;
  bucket: IeltsQuotaBucket;
  cap: number;
}): Promise<IeltsQuotaReservation> {
  const { ownerUserId, dayKey, bucket, cap } = args;
  const where = { ownerUserId_dayKey_bucket: { ownerUserId, dayKey, bucket } };
  const conditionalScope = { ownerUserId, dayKey, bucket, usedCount: { lt: cap } };

  /** One atomic conditional increment; returns the slot count after it. */
  const tryIncrement = async (): Promise<IeltsQuotaReservation> => {
    const updated = await db.ieltsGenerationQuota.updateMany({
      where: conditionalScope,
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count !== 1) {
      const atCap = await db.ieltsGenerationQuota.findUnique({ where, select: { usedCount: true } });
      return { reserved: false, usedCount: atCap?.usedCount ?? cap };
    }
    const after = await db.ieltsGenerationQuota.findUnique({ where, select: { usedCount: true } });
    return { reserved: true, usedCount: after?.usedCount ?? cap };
  };

  const incremented = await tryIncrement();
  // `count === 0` means either "at the cap" (refused above) or "no row yet".
  // Distinguishing them needs one read — but only when the increment failed.
  if (incremented.reserved) return incremented;
  const existing = await db.ieltsGenerationQuota.findUnique({ where, select: { usedCount: true } });
  if (existing) {
    // The row appeared BETWEEN the conditional UPDATE and this read: a concurrent first
    // reservation won the INSERT race, so this call has not competed for a slot yet.
    // Re-run the conditional increment exactly once.
    //
    // Returning the earlier refusal here dropped callers while capacity remained —
    // measured in CI 2026-10-08: 10 concurrent reservations against a cap of 8 granted
    // only 6 (the two callers that landed in this window were refused although
    // `usedCount` was still 1). Still loop-free: one extra attempt, and a failed second
    // attempt is a trustworthy refusal because a row exists and the predicate (`usedCount
    // < cap`) was evaluated against it.
    return tryIncrement();
  }

  // First reservation for this (student, day, bucket): INSERT. Exactly one
  // concurrent INSERT wins the unique index; the losers re-run the conditional
  // increment once against the row that now exists.
  try {
    const created = await db.ieltsGenerationQuota.create({
      data: { ownerUserId, dayKey, bucket, usedCount: 1 },
      select: { usedCount: true },
    });
    return { reserved: true, usedCount: created.usedCount };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return tryIncrement();
  }
}

/**
 * Give a reserved slot back. Used when a generation produced NO persisted test,
 * which is exactly the set of cases the previous row-counting implementation
 * did not count either (the count was derived from created IeltsTest rows), so
 * the product semantics are unchanged.
 */
export async function releaseInstantQuota(args: {
  ownerUserId: string;
  dayKey: string;
  bucket: IeltsQuotaBucket;
}): Promise<void> {
  await db.ieltsGenerationQuota.updateMany({
    where: {
      ownerUserId: args.ownerUserId,
      dayKey: args.dayKey,
      bucket: args.bucket,
      usedCount: { gt: 0 },
    },
    data: { usedCount: { decrement: 1 } },
  });
}

/** Slots already used today (reporting only — never the gate). */
export async function readInstantQuotaUsed(args: {
  ownerUserId: string;
  dayKey: string;
  bucket: IeltsQuotaBucket;
}): Promise<number> {
  const row = await db.ieltsGenerationQuota.findUnique({
    where: {
      ownerUserId_dayKey_bucket: {
        ownerUserId: args.ownerUserId,
        dayKey: args.dayKey,
        bucket: args.bucket,
      },
    },
    select: { usedCount: true },
  });
  return row?.usedCount ?? 0;
}

export async function getSectionById(id: string) {
  return db.ieltsSection.findUnique({ where: { id } });
}

/**
 * Sections of a test, ordered, with only the text needed for delivery decisions
 * (transcript presence/length + label). Bounded projection: no questions, no keys.
 */
export async function listSectionsForTest(testId: string) {
  return db.ieltsSection.findMany({
    where: { testId },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, orderIndex: true, label: true, transcriptText: true },
  });
}

// ============================================
// Attempts
// ============================================

export async function createAttempt(data: Prisma.IeltsAttemptCreateInput) {
  return db.ieltsAttempt.create({ data });
}

export async function findAttemptById(id: string) {
  return db.ieltsAttempt.findUnique({ where: { id } });
}

export async function findAttemptWithResponses(id: string) {
  return db.ieltsAttempt.findUnique({
    where: { id },
    include: {
      responses: { orderBy: { answeredAt: 'asc' } },
    },
  });
}

/**
 * Latest attempt by this student for this test (reload safety):
 * an unchanged page load must never mint a second attempt, and a submitted
 * attempt must stay readable instead of being silently replaced.
 */
export async function findLatestAttemptForTest(userId: string, testId: string) {
  return db.ieltsAttempt.findFirst({
    where: { userId, testId },
    orderBy: { startedAt: 'desc' },
  });
}

/** The single ACTIVE attempt for (student, test), if any (concurrency winner lookup). */
export async function findActiveAttemptForTest(userId: string, testId: string) {
  return db.ieltsAttempt.findFirst({
    where: { userId, testId, status: 'IN_PROGRESS' },
  });
}

/**
 * Explicit retake: retire any active attempt so the unique `activeKey` is free
 * for the replacement. Without this, `force: true` could not insert a second
 * IN_PROGRESS row (the unique index would reject it) and the old attempt would
 * linger as IN_PROGRESS forever.
 */
export async function abandonActiveAttempts(userId: string, testId: string) {
  return db.ieltsAttempt.updateMany({
    where: { userId, testId, status: 'IN_PROGRESS' },
    data: { status: 'ABANDONED', activeKey: null },
  });
}

export async function findAttemptsByUser(userId: string, opts?: { skill?: string; take?: number }) {
  return db.ieltsAttempt.findMany({
    where: { userId, ...(opts?.skill ? { skill: opts.skill } : {}) },
    orderBy: { startedAt: 'desc' },
    take: opts?.take ?? 50,
    select: {
      id: true,
      testId: true,
      skill: true,
      testType: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      rawScore: true,
      totalItems: true,
      bandEstimate: true,
    },
  });
}

/** One response row for a question inside an attempt (mistake explanations). */
export async function findResponseForQuestion(attemptId: string, questionId: string) {
  return db.ieltsResponse.findFirst({
    where: { attemptId, questionId },
    select: { id: true, rawAnswer: true, verdict: true },
  });
}

/**
 * Atomically finalise an attempt submission — the ONLY way an attempt may move
 * IN_PROGRESS → SUBMITTED.
 *
 * 2026-10-08 (Sprint 131): the previous flow was
 * `read status → score → createResponses → update status`, so two concurrent
 * submissions of the same attempt could BOTH finalise it (duplicate response
 * rows / duplicate completion events / a response set computed from one request
 * and a score written by the other).
 *
 * The conditional status transition and the response rows are now written in a
 * single short transaction:
 *
 *   * `updateMany({ where: { id, userId, status: 'IN_PROGRESS' } })` is the
 *     single winner — Postgres serialises the row lock, and the loser
 *     re-evaluates the predicate against the committed row, matches 0 rows and
 *     rolls its own transaction back (so it cannot mix its answers in).
 *   * Because both writes share the transaction, an attempt can never end up
 *     SUBMITTED without its responses (the previous order could).
 *
 * Only the winner may emit completion events.
 */
export async function finalizeAttemptSubmission(args: {
  attemptId: string;
  userId: string;
  responses: Prisma.IeltsResponseCreateManyInput[];
  score: {
    rawScore: number;
    totalItems: number;
    bandEstimate: string | null;
    metadata: string | null;
  };
}): Promise<{ finalized: boolean }> {
  return db.$transaction(
    async (tx) => {
      const claimed = await tx.ieltsAttempt.updateMany({
        where: { id: args.attemptId, userId: args.userId, status: 'IN_PROGRESS' },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          activeKey: null,
          rawScore: args.score.rawScore,
          totalItems: args.score.totalItems,
          bandEstimate: args.score.bandEstimate,
          metadata: args.score.metadata,
        },
      });
      if (claimed.count !== 1) return { finalized: false };
      if (args.responses.length > 0) {
        await tx.ieltsResponse.createMany({ data: args.responses, skipDuplicates: true });
      }
      return { finalized: true };
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}

// ============================================
// Transactional generation persistence (2026-10-08 Sprint 131)
// ============================================
//
// A generation is ONE logical persistence unit: its test row, sections and
// questions must all exist, or none may. The previous implementation issued
// them as independent statements, so a failure part-way through left a
// half-written test — and an INSTANT (owner-only) test is deliverable at any
// status except REJECTED, so the student could open a truncated or empty
// practice set, while the orphan rows still occupied a quota slot.
//
// The AI calls (generation + blind-solve verification) happen BEFORE these
// functions, so the transaction stays short and never wraps a provider call.

export interface IeltsGeneratedSectionInput {
  label: string;
  passageText: string | null;
  transcriptText: string | null;
  wordCount: number | null;
  /** Question rows WITHOUT testId / sectionId / orderIndex (assigned here). */
  questions: Array<Omit<Prisma.IeltsQuestionCreateManyInput, 'testId' | 'sectionId' | 'orderIndex'>>;
}

/** Atomically persist a generated objective test (test + sections + questions). */
export async function persistGeneratedTest(args: {
  test: Prisma.IeltsTestCreateInput;
  sections: IeltsGeneratedSectionInput[];
  validationNotes: string;
}): Promise<{ testId: string }> {
  return db.$transaction(
    async (tx) => {
      const test = await tx.ieltsTest.create({ data: args.test });
      let orderIndex = 0;
      for (let s = 0; s < args.sections.length; s++) {
        const input = args.sections[s];
        const section = await tx.ieltsSection.create({
          data: {
            testId: test.id,
            orderIndex: s,
            label: input.label,
            passageText: input.passageText,
            transcriptText: input.transcriptText,
            wordCount: input.wordCount,
          },
        });
        if (input.questions.length > 0) {
          await tx.ieltsQuestion.createMany({
            data: input.questions.map((q) => ({
              ...q,
              testId: test.id,
              sectionId: section.id,
              orderIndex: orderIndex++,
            })),
          });
        }
      }
      await tx.ieltsQuestion.updateMany({
        where: { testId: test.id },
        data: { validationStatus: 'QA_REQUIRED', validationNotes: args.validationNotes },
      });
      return { testId: test.id };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
}

/** Atomically persist a generated writing task (test + task section + prompt). */
export async function persistGeneratedWritingTask(args: {
  test: Prisma.IeltsTestCreateInput;
  section: { label: string; instructions: string; wordCount: number };
  question: Omit<Prisma.IeltsQuestionCreateManyInput, 'testId' | 'sectionId' | 'orderIndex'>;
}): Promise<{ testId: string }> {
  return db.$transaction(
    async (tx) => {
      const test = await tx.ieltsTest.create({ data: args.test });
      const section = await tx.ieltsSection.create({
        data: {
          testId: test.id,
          orderIndex: 0,
          label: args.section.label,
          instructions: args.section.instructions,
          wordCount: args.section.wordCount,
        },
      });
      await tx.ieltsQuestion.create({
        data: { ...args.question, testId: test.id, sectionId: section.id, orderIndex: 0 },
      });
      return { testId: test.id };
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}

// ============================================
// Assessments
// ============================================

export async function createAssessment(data: Prisma.IeltsAssessmentCreateInput) {
  return db.ieltsAssessment.create({ data });
}

export async function findAssessmentById(id: string) {
  return db.ieltsAssessment.findUnique({ where: { id } });
}

export async function findAssessmentForUser(id: string, userId: string) {
  return db.ieltsAssessment.findFirst({ where: { id, userId } });
}

export async function listAssessmentsByUser(userId: string, opts?: { skill?: string; take?: number }) {
  return db.ieltsAssessment.findMany({
    where: { userId, ...(opts?.skill ? { skill: opts.skill } : {}), status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    take: opts?.take ?? 50,
    select: {
      id: true,
      skill: true,
      taskType: true,
      promptVersion: true,
      assessmentSource: true,
      confidence: true,
      estimatedBand: true,
      languageBandEstimate: true,
      createdAt: true,
    },
  });
}

// ============================================
// Calibration (infrastructure; human marks only)
// ============================================

export async function createCalibrationRecord(data: Prisma.IeltsCalibrationRecordCreateInput) {
  return db.ieltsCalibrationRecord.create({ data });
}

/** Real paired human marks only — rows without humanBand are excluded. */
export async function listPairedCalibrationRecords() {
  return db.ieltsCalibrationRecord.findMany({
    where: { humanBand: { not: null } },
    select: { assessmentId: true, aiBand: true, humanBand: true },
  });
}

// ============================================
// Progress projections (SQL-level aggregates; never slice-derived totals)
// ============================================

export async function countAttemptsBySkillAndStatus(userId: string) {
  return db.ieltsAttempt.groupBy({
    by: ['skill', 'status'],
    where: { userId },
    _count: { _all: true },
  });
}

export async function findLatestSubmittedAttemptForSkill(userId: string, skill: string) {
  return db.ieltsAttempt.findFirst({
    where: { userId, skill, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      testId: true,
      skill: true,
      testType: true,
      submittedAt: true,
      rawScore: true,
      totalItems: true,
      bandEstimate: true,
    },
  });
}

export async function findLatestCompletedAssessmentForSkill(userId: string, skill: string) {
  return db.ieltsAssessment.findFirst({
    where: { userId, skill, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      skill: true,
      taskType: true,
      promptVersion: true,
      assessmentSource: true,
      confidence: true,
      estimatedBand: true,
      languageBandEstimate: true,
      createdAt: true,
    },
  });
}
