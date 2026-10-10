// ============================================
// Self-Directed Practice — repository (2026-10-10, Sprint 140)
// ============================================
// All database access for this feature lives here. Concurrency rules follow
// ADR-049: uniqueness that matters is enforced BY THE DATABASE, never by a
// read-check-write sequence.
//   - one submission per set  → `CustomPracticeSubmission.setId @unique`
//     (the loser of a duplicate submit gets P2002, mapped to 409 — no lock, no
//      transaction that catches its own constraint violation);
//   - questions are written in the SAME transaction as their set, so a set can
//     never exist without its questions.
// The AI call never happens inside a transaction.
// ============================================

import { db } from '@/shared/db/db';
import type { PracticeSpec, ValidatedQuestion } from '../domain/types';

export interface PersistGeneratedSetInput {
  ownerUserId: string;
  spec: PracticeSpec;
  promptVersion: string;
  model: string | null;
  questions: ValidatedQuestion[];
}

export interface PersistedSet {
  setId: string;
  questions: Array<{ id: string; orderIndex: number; maxMarks: number; questionType: string }>;
}

export async function persistGeneratedSet(input: PersistGeneratedSetInput): Promise<PersistedSet> {
  const created = await db.$transaction(
    async tx => {
      return tx.customPracticeSet.create({
        data: {
          ownerUserId: input.ownerUserId,
          requestText: input.spec.requestText,
          objective: input.spec.objective,
          category: input.spec.category,
          difficulty: input.spec.difficulty,
          questionCount: input.spec.questionCount,
          interpretation: input.spec.interpretation,
          promptVersion: input.promptVersion,
          model: input.model,
          questions: {
            create: input.questions.map(question => ({
              orderIndex: question.orderIndex,
              questionType: question.questionType,
              instructions: question.instructions,
              prompt: question.prompt,
              answerKey: question.answerKey,
              acceptedAnswers: JSON.stringify(question.acceptedAnswers),
              rejectedAnswers: JSON.stringify(question.rejectedAnswers),
              rubric: JSON.stringify(question.rubric),
              targetRule: question.targetRule,
              explanationZh: question.explanationZh,
              explanationEn: question.explanationEn,
              misconceptionTags: JSON.stringify(question.misconceptionTags),
              maxMarks: question.maxMarks,
            })),
          },
        },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      });
    },
    { maxWait: 5_000, timeout: 15_000 }
  );

  return {
    setId: created.id,
    questions: created.questions.map(question => ({
      id: question.id,
      orderIndex: question.orderIndex,
      maxMarks: question.maxMarks,
      questionType: question.questionType,
    })),
  };
}

/** Owner-scoped read: a non-owner gets `null`, never a 403 that reveals existence. */
export async function getOwnedSet(setId: string, ownerUserId: string) {
  return db.customPracticeSet.findFirst({
    where: { id: setId, ownerUserId },
    include: {
      questions: { orderBy: { orderIndex: 'asc' } },
      submission: true,
    },
  });
}

export async function listOwnSets(ownerUserId: string, take = 20) {
  return db.customPracticeSet.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      objective: true,
      category: true,
      difficulty: true,
      questionCount: true,
      createdAt: true,
      submission: { select: { id: true, awardedMarks: true, totalMarks: true } },
    },
  });
}

export interface PersistSubmissionInput {
  setId: string;
  ownerUserId: string;
  awardedMarks: number;
  totalMarks: number;
  needsReviewCount: number;
  overallFeedback: string | null;
  gradingModel: string | null;
  gradingPromptVersion: string;
  responses: Array<{
    questionId: string;
    answerText: string;
    verdict: string;
    awardedMarks: number;
    rationale: string;
    referenceAnswer: string;
    acceptedAlternatives: string[];
    improvement: string | null;
    needsReview: boolean;
  }>;
}

/**
 * Creates the single submission for a set together with its graded responses.
 * A duplicate submission surfaces as a unique violation on `setId`, which the
 * caller maps to 409 — the database, not application logic, guarantees there is
 * exactly one.
 */
export async function createSubmissionWithResponses(input: PersistSubmissionInput) {
  return db.$transaction(
    async tx => {
      return tx.customPracticeSubmission.create({
        data: {
          setId: input.setId,
          ownerUserId: input.ownerUserId,
          status: 'GRADED',
          gradedAt: new Date(),
          awardedMarks: input.awardedMarks,
          totalMarks: input.totalMarks,
          needsReviewCount: input.needsReviewCount,
          overallFeedback: input.overallFeedback,
          gradingModel: input.gradingModel,
          gradingPromptVersion: input.gradingPromptVersion,
          responses: {
            create: input.responses.map(response => ({
              questionId: response.questionId,
              answerText: response.answerText,
              verdict: response.verdict,
              awardedMarks: response.awardedMarks,
              rationale: response.rationale,
              referenceAnswer: response.referenceAnswer,
              acceptedAlternatives: JSON.stringify(response.acceptedAlternatives),
              improvement: response.improvement,
              needsReview: response.needsReview,
            })),
          },
        },
        include: {
          responses: true,
        },
      });
    },
    { maxWait: 5_000, timeout: 15_000 }
  );
}

export async function getSubmissionWithResponses(setId: string, ownerUserId: string) {
  return db.customPracticeSubmission.findFirst({
    where: { setId, ownerUserId },
    include: {
      responses: {
        include: {
          question: {
            select: {
              orderIndex: true,
              maxMarks: true,
              explanationEn: true,
              explanationZh: true,
              misconceptionTags: true,
              targetRule: true,
            },
          },
        },
      },
    },
  });
}
