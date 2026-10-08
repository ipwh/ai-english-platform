// ============================================
// IELTS Attempt Service — start / submit / read
// ============================================
// Server-authoritative scoring: client correctness claims are never trusted;
// objective answers are scored by `scoreIeltsItem()` only. Band estimates are
// range estimates with explicit provenance (docs/ielts/IELTS_SCORING.md).
//
// IELTS attempts are ISOLATED: no XP, no HKDSE evidence, no mastery/mistakes.
// ============================================

import type { IeltsQuestion } from '@prisma/client';
import type { IeltsBandEstimate, IeltsSkill } from '../domain/types';
import { isIeltsObjectiveType, type IeltsItemScore } from '../domain/types';
import {
  estimateComponentBandForAttempt,
  isBandEstimate,
} from '../domain/conversion';
import { scoreIeltsItem } from '../scoring/objective-scorer';
import { aggregateObjectiveResults } from '../scoring/aggregate';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import { parseJson, rowToFeedback, rowToQuestionDefinition, rowToScorableItem } from './row-mappers';
import type { IeltsListeningItemEvidence } from '../domain/types';

export interface IeltsAttemptSummary {
  id: string;
  userId: string;
  testId: string;
  skill: string;
  testType: string;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  rawScore: number | null;
  totalItems: number | null;
  bandEstimate: IeltsBandEstimate | null;
  notComparableReason: string | null;
}

export type IeltsAttemptOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/** Postgres/SQLite unique-violation detector (no Prisma runtime import needed). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

// ============================================
// Start
// ============================================

export async function startIeltsAttempt(input: {
  userId: string;
  testId: string;
  /** Explicit retake: ignore an existing attempt for this test and start a new one. */
  force?: boolean;
}): Promise<IeltsAttemptOperationResult<IeltsAttemptSummary>> {
  const test = await ieltsRepo.getTestById(input.testId);
  if (!test) return { ok: false, status: 404, error: 'Test not found' };
  // CATALOGUE tests require publication. INSTANT self-study sets are NOT
  // published — they are deliverable to their owner ONLY (never listed).
  const isInstant = test.origin === 'INSTANT';
  if (isInstant) {
    if (test.ownerUserId !== input.userId) {
      return { ok: false, status: 403, error: 'This self-study practice belongs to another student.' };
    }
    if (test.status === 'REJECTED') {
      return { ok: false, status: 403, error: 'This practice set was withdrawn.' };
    }
  } else if (test.status !== 'PUBLISHED') {
    return { ok: false, status: 403, error: 'Test is not published' };
  }

  // Reload safety (2026-10-04): a page load (or a refresh) must never mint a
  // second attempt for the same test + student.
  //   * an unfinished attempt is RESUMED — the student continues where they were
  //   * a submitted attempt is RETURNED as-is so the client can restore the
  //     result and the student's own answers (retaking is explicit: `force`)
  //   * ABANDONED attempts are ignored (a fresh attempt is created)
  // Before this, every mount created a new attempt, so refreshing polluted the
  // practice history and silently discarded the student's result.
  //
  // Concurrency (2026-10-08): `findFirst` + `create` is NOT safe — two
  // simultaneous starts both observe "no active attempt" and both INSERT, so
  // the student ends up with two IN_PROGRESS attempts. The database now
  // enforces the invariant through the unique `activeKey`:
  //   * `force` (explicit retake) first retires any active attempt, freeing it
  //   * a create that loses the race gets P2002 and returns the winner's row
  if (input.force) {
    await ieltsRepo.abandonActiveAttempts(input.userId, test.id);
  } else {
    const existing = await ieltsRepo.findLatestAttemptForTest(input.userId, test.id);
    if (existing && existing.status !== 'ABANDONED') {
      return { ok: true, data: toSummary(existing) };
    }
  }

  let attempt: Awaited<ReturnType<typeof ieltsRepo.createAttempt>>;
  try {
    attempt = await ieltsRepo.createAttempt({
      user: { connect: { id: input.userId } },
      test: { connect: { id: test.id } },
      skill: test.skill,
      testType: test.testType,
      // Occupied only while IN_PROGRESS; cleared on submit/abandon, so at most
      // ONE active attempt can exist per (student, test).
      activeKey: `${input.userId}:${test.id}`,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost the create race — hand both callers the same, coherent attempt.
    const winner =
      (await ieltsRepo.findActiveAttemptForTest(input.userId, test.id)) ??
      (await ieltsRepo.findLatestAttemptForTest(input.userId, test.id));
    if (winner) return { ok: true, data: toSummary(winner) };
    throw err;
  }

  emitIeltsEvent('ielts.practice.started', {
    userId: input.userId,
    attemptId: attempt.id,
    skill: test.skill,
  });

  return { ok: true, data: toSummary(attempt) };
}

// ============================================
// Submit
// ============================================

export interface IeltsSubmittedAnswerInput {
  questionId: string;
  answer: string;
}

export interface IeltsResponseFeedback {
  questionId: string;
  studentAnswer: string;
  verdict: IeltsItemScore['verdict'];
  reason: IeltsItemScore['reason'];
  wordCount?: number;
  limitExceeded?: boolean;
  correctAnswer: unknown;
  acceptedAnswers: string[] | null;
  explanation: string | null;
  evidence: unknown;
}

export interface IeltsSubmissionSummary extends IeltsAttemptSummary {
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  ungradableCount: number;
  results: IeltsResponseFeedback[];
  /**
   * Listening transcripts, released ONLY with a submitted result (2026-10-08).
   * Withheld while the attempt is open: delivering the transcript before the
   * student answers would hand over every answer.
   */
  transcripts: IeltsSectionTranscript[];
}

export interface IeltsSectionTranscript {
  sectionId: string;
  label: string;
  orderIndex: number;
  transcript: string;
}

/**
 * SINGLE gate for releasing listening transcripts to a candidate.
 *
 * The transcript is hidden while the attempt is open (pre-answer delivery = answer
 * leakage) and released with the submitted result. Two callers depend on this:
 *   * the submit/detail payloads below (post-submission reveal)
 *   * `catalog-service.getSectionTranscriptForDelivery()` — which deliberately does
 *     NOT gate on submission, because it feeds the platform TTS audio route that the
 *     student must be able to play BEFORE answering
 *
 * 2026-10-08: the runner promised "the transcript is revealed after submission" but
 * nothing ever delivered or rendered it (the service existed, yet was only wired to
 * the audio route). The reveal now travels with the submitted result.
 */
function toDeliveredTranscripts(
  sections: Array<{ id: string; orderIndex: number; label: string; transcriptText: string | null }>,
): IeltsSectionTranscript[] {
  return sections
    .filter((s): s is typeof s & { transcriptText: string } => Boolean(s.transcriptText && s.transcriptText.trim()))
    .map((s) => ({
      sectionId: s.id,
      label: s.label,
      orderIndex: s.orderIndex,
      transcript: s.transcriptText,
    }));
}

export async function submitIeltsAttempt(input: {
  userId: string;
  attemptId: string;
  answers: IeltsSubmittedAnswerInput[];
}): Promise<IeltsAttemptOperationResult<IeltsSubmissionSummary>> {
  const attempt = await ieltsRepo.findAttemptById(input.attemptId);
  if (!attempt) return { ok: false, status: 404, error: 'Attempt not found' };
  if (attempt.userId !== input.userId) return { ok: false, status: 403, error: 'You cannot submit this attempt' };
  if (attempt.status !== 'IN_PROGRESS') {
    return { ok: false, status: 409, error: 'ATTEMPT_ALREADY_SUBMITTED: use GET to read the existing result.' };
  }

  // Delivery gate (2026-10-03 VII): CATALOGUE = published only; INSTANT
  // self-study = owner-only, any status except REJECTED. The question
  // allow-list follows the same split (instant sets are QA_REQUIRED).
  const testRow = await ieltsRepo.getTestById(attempt.testId);
  if (!testRow) return { ok: false, status: 404, error: 'Test is no longer available' };
  const isInstant = testRow.origin === 'INSTANT';
  const allowedQuestionStatuses = isInstant
    ? ['QA_REQUIRED', 'HUMAN_APPROVED', 'PUBLISHED']
    : ['PUBLISHED'];
  const deliverable = isInstant
    ? testRow.ownerUserId === attempt.userId && testRow.status !== 'REJECTED'
    : testRow.status === 'PUBLISHED';
  if (!deliverable) {
    return { ok: false, status: 404, error: 'Test is no longer available' };
  }

  const test = await ieltsRepo.getTestForAttempt(attempt.testId, {
    questionStatuses: allowedQuestionStatuses,
  });
  if (!test) return { ok: false, status: 404, error: 'Test is no longer available' };

  const deliverableRows = await ieltsRepo.findQuestionsByIds(test.questions.map((q) => q.id));
  const rowById = new Map<string, IeltsQuestion>();
  for (const row of deliverableRows) {
    if (row.testId !== attempt.testId) continue; // defensive: never score cross-test
    if (!allowedQuestionStatuses.includes(row.validationStatus)) continue;
    rowById.set(row.id, row);
  }

  // Validate all submitted ids belong to this deliverable test.
  for (const answer of input.answers) {
    if (!rowById.has(answer.questionId)) {
      emitIeltsEvent('ielts.question.invalid', {
        userId: input.userId,
        attemptId: attempt.id,
        questionId: answer.questionId,
        code: 'UNKNOWN_QUESTION',
      });
      return {
        ok: false,
        status: 422,
        error: `UNKNOWN_QUESTION: ${answer.questionId} is not a deliverable question of this test.`,
      };
    }
  }

  // Deterministic scoring (server-only).
  const scored: Array<{ answer: IeltsSubmittedAnswerInput; row: IeltsQuestion; score: IeltsItemScore }> = [];
  for (const answer of input.answers) {
    const row = rowById.get(answer.questionId)!;
    const scorable = rowToScorableItem(row);
    // Merge legacy evidence word limits when the question row lacks one.
    const definition = rowToQuestionDefinition(row);
    const effectiveLimit =
      scorable.wordLimit ??
      (definition.evidence && 'expectedAnswer' in definition.evidence
        ? (definition.evidence as IeltsListeningItemEvidence).wordLimit ?? null
        : null);
    const score = scoreIeltsItem(answer.answer, { ...scorable, wordLimit: effectiveLimit });
    scored.push({ answer, row, score });
  }

  const objectiveScores = scored
    .filter((s) => isIeltsObjectiveType(s.row.questionType as never))
    .map((s) => s.score);
  const aggregate = aggregateObjectiveResults(objectiveScores);

  // totalItems = every published objective question in the test (unanswered = incorrect).
  const objectiveQuestionCount = [...rowById.values()].filter((r) =>
    isIeltsObjectiveType(r.questionType as never),
  ).length;

  // Band estimate for objective components (subset-safe).
  let bandEstimate: IeltsBandEstimate | null = null;
  let notComparableReason: string | null = null;
  if (attempt.skill === 'READING' || attempt.skill === 'LISTENING') {
    const estimate = estimateComponentBandForAttempt({
      testType: attempt.testType as never,
      component: attempt.skill,
      rawScore: aggregate.rawScore,
      rawTotal: objectiveQuestionCount,
    });
    if (isBandEstimate(estimate)) bandEstimate = estimate;
    else notComparableReason = estimate.reason;
  } else {
    notComparableReason = 'NO_OBJECTIVE_SCORING: this skill is not scored deterministically.';
  }

  const metadata = JSON.stringify({
    answeredCount: scored.length,
    objectiveQuestionCount,
    notComparableReason,
  });

  // Atomic finalisation (2026-10-08): the conditional status transition
  // (IN_PROGRESS → SUBMITTED, owner-scoped) and the response rows are written in
  // ONE transaction. Concurrent submissions of the same attempt therefore have
  // exactly one winner; the loser's transaction is rolled back (so its answers
  // are never mixed into the winner's result) and it gets a deterministic 409.
  // A submitted attempt can never exist without its persisted responses.
  const finalize = await ieltsRepo.finalizeAttemptSubmission({
    attemptId: attempt.id,
    userId: input.userId,
    responses: scored.map((s) => ({
      attemptId: attempt.id,
      questionId: s.row.id,
      rawAnswer: s.answer.answer,
      verdict: s.score.verdict,
      scoringDetail: JSON.stringify({
        scoredBy: s.score.scoredBy,
        reason: s.score.reason,
        wordCount: s.score.wordCount,
        limitExceeded: s.score.limitExceeded,
      }),
    })),
    score: {
      rawScore: aggregate.rawScore,
      totalItems: objectiveQuestionCount,
      bandEstimate: bandEstimate ? JSON.stringify(bandEstimate) : null,
      metadata,
    },
  });
  if (!finalize.finalized) {
    // Another request already won the submission — never emit completion events
    // or recompute side effects for a losing request.
    return {
      ok: false,
      status: 409,
      error: 'ATTEMPT_ALREADY_SUBMITTED: use GET to read the existing result.',
    };
  }

  emitIeltsEvent('ielts.practice.completed', {
    userId: input.userId,
    attemptId: attempt.id,
    skill: attempt.skill,
    itemCount: objectiveQuestionCount,
    correctCount: aggregate.rawScore,
    rawScore: aggregate.rawScore,
  });

  const results: IeltsResponseFeedback[] = scored.map((s) => {
    const feedback = rowToFeedback(s.row);
    return {
      questionId: s.row.id,
      studentAnswer: s.answer.answer,
      verdict: s.score.verdict,
      reason: s.score.reason,
      wordCount: s.score.wordCount,
      limitExceeded: s.score.limitExceeded,
      correctAnswer: feedback.answerKey ?? null,
      acceptedAnswers: feedback.acceptedAnswers ?? null,
      explanation: feedback.explanation,
      evidence: feedback.evidence ?? null,
    };
  });

  // Emission per answered objective question (bounded; no content).
  for (const s of scored) {
    if (isIeltsObjectiveType(s.row.questionType as never)) {
      emitIeltsEvent('ielts.question.answered', {
        userId: input.userId,
        attemptId: attempt.id,
        questionId: s.row.id,
        code: s.score.verdict,
      });
    }
  }

  return {
    ok: true,
    data: {
      id: attempt.id,
      userId: attempt.userId,
      testId: attempt.testId,
      skill: attempt.skill,
      testType: attempt.testType,
      status: 'SUBMITTED',
      startedAt: attempt.startedAt,
      submittedAt: new Date(),
      rawScore: aggregate.rawScore,
      totalItems: objectiveQuestionCount,
      bandEstimate,
      notComparableReason,
      answeredCount: scored.length,
      correctCount: aggregate.correct,
      incorrectCount: aggregate.incorrect,
      ungradableCount: aggregate.ungradable,
      results,
      // The result is being delivered here, so the transcript is released with it.
      transcripts: toDeliveredTranscripts(test.sections),
    },
  };
}

// ============================================
// Read
// ============================================

export interface IeltsAttemptDetail extends IeltsAttemptSummary {
  responses: Array<{
    questionId: string;
    rawAnswer: string;
    verdict: string | null;
    scoringDetail: Record<string, unknown> | null;
    answeredAt: Date;
  }>;
  feedback: IeltsResponseFeedback[];
  /** Released only for a SUBMITTED attempt (see toDeliveredTranscripts). */
  transcripts: IeltsSectionTranscript[];
}

export async function getIeltsAttemptDetail(
  attemptId: string,
): Promise<IeltsAttemptOperationResult<IeltsAttemptDetail>> {
  const row = await ieltsRepo.findAttemptWithResponses(attemptId);
  if (!row) return { ok: false, status: 404, error: 'Attempt not found' };

  let feedback: IeltsResponseFeedback[] = [];
  // Transcript release mirrors the feedback gate exactly: a submitted attempt only.
  let transcripts: IeltsSectionTranscript[] = [];
  if (row.status === 'SUBMITTED') {
    transcripts = toDeliveredTranscripts(await ieltsRepo.listSectionsForTest(row.testId));
  }
  if (row.status === 'SUBMITTED' && row.responses.length > 0) {
    const questions = await ieltsRepo.findQuestionsByIds(row.responses.map((r) => r.questionId));
    const byId = new Map(questions.map((q) => [q.id, q]));
    const collected: IeltsResponseFeedback[] = [];
    for (const r of row.responses) {
      const question = byId.get(r.questionId);
      if (!question) continue;
      const detail = parseJson<Record<string, unknown>>(r.scoringDetail, {});
      const fb = rowToFeedback(question);
      collected.push({
        questionId: r.questionId,
        studentAnswer: r.rawAnswer,
        verdict: (r.verdict ?? 'ungradable') as IeltsItemScore['verdict'],
        reason: (detail.reason as IeltsItemScore['reason']) ?? 'NO_MATCH',
        wordCount: typeof detail.wordCount === 'number' ? detail.wordCount : undefined,
        limitExceeded: detail.limitExceeded === true,
        correctAnswer: fb.answerKey ?? null,
        acceptedAnswers: fb.acceptedAnswers ?? null,
        explanation: fb.explanation,
        evidence: fb.evidence ?? null,
      });
    }
    feedback = collected;
  }

  return {
    ok: true,
    data: {
      ...toSummary(row),
      responses: row.responses.map((r) => ({
        questionId: r.questionId,
        rawAnswer: r.rawAnswer,
        verdict: r.verdict,
        scoringDetail: parseJson<Record<string, unknown> | null>(r.scoringDetail, null),
        answeredAt: r.answeredAt,
      })),
      feedback,
      transcripts,
    },
  };
}

// ============================================
// Helpers
// ============================================

function toSummary(attempt: {
  id: string;
  userId: string;
  testId: string;
  skill: string;
  testType: string;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  rawScore: number | null;
  totalItems: number | null;
  bandEstimate: string | null;
  metadata: string | null;
}): IeltsAttemptSummary {
  const metadata = parseJson<{ notComparableReason?: string | null }>(attempt.metadata, {});
  return {
    id: attempt.id,
    userId: attempt.userId,
    testId: attempt.testId,
    skill: attempt.skill,
    testType: attempt.testType,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    rawScore: attempt.rawScore,
    totalItems: attempt.totalItems,
    bandEstimate: parseJson<IeltsBandEstimate | null>(attempt.bandEstimate, null),
    notComparableReason: metadata.notComparableReason ?? null,
  };
}

export { toSummary as attemptRowToSummary };
export type { IeltsSkill };
