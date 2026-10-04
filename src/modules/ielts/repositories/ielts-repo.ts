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

/** Count of INSTANT self-study sets created for a student since a timestamp
 * (the per-student daily cap on on-demand AI generation). */
export async function countInstantTestsCreatedSince(ownerUserId: string, since: Date) {
  return db.ieltsTest.count({
    where: { origin: 'INSTANT', ownerUserId, createdAt: { gte: since } },
  });
}

/**
 * Full-component INSTANT generations for a student since a timestamp.
 * A full component is created with `durationMinutes` set (60 reading / 40
 * listening); single sets leave it null — that is the discriminator.
 */
export async function countInstantComponentsCreatedSince(ownerUserId: string, since: Date) {
  return db.ieltsTest.count({
    where: {
      origin: 'INSTANT',
      ownerUserId,
      createdAt: { gte: since },
      durationMinutes: { not: null },
    },
  });
}

export async function getSectionById(id: string) {
  return db.ieltsSection.findUnique({ where: { id } });
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

export async function createResponses(data: Prisma.IeltsResponseCreateManyInput[]) {
  if (!data || data.length === 0) return { count: 0 };
  return db.ieltsResponse.createMany({ data, skipDuplicates: true });
}

/** One response row for a question inside an attempt (mistake explanations). */
export async function findResponseForQuestion(attemptId: string, questionId: string) {
  return db.ieltsResponse.findFirst({
    where: { attemptId, questionId },
    select: { id: true, rawAnswer: true, verdict: true },
  });
}

export async function markAttemptSubmitted(
  id: string,
  data: { rawScore: number; totalItems: number; bandEstimate?: string | null; metadata?: string | null },
) {
  return db.ieltsAttempt.update({
    where: { id },
    data: { status: 'SUBMITTED', submittedAt: new Date(), ...data },
  });
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
