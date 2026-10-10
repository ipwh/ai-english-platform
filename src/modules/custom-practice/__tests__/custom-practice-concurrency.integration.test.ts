// ============================================
// Self-Directed Practice — submission concurrency on REAL PostgreSQL
// (Sprint 141, P0 #2)
// ============================================
// Proves the one-submission-per-set contract is enforced by the DATABASE, not by
// an application read-check-write:
//   C1  two concurrent submissions  → exactly one persists, the loser is told
//       ALREADY_SUBMITTED (409 at the route), never a second set of marks
//   C2  staggered concurrent submits → same guarantee with different timing
//   C3  a non-owner submitting concurrently → NOT_FOUND and no rows written
//   C4  a failure INSIDE the transaction → the whole grading result rolls back
//       (no submission and no orphan response rows)
//
// GATED on TEST_DATABASE_URL (CI sets it); skipped elsewhere — an explicit
// integration gate, never a way to hide a failure. Imports are lazy so a skipped
// suite never constructs the Prisma adapter. The fixture uses only OBJECTIVE
// questions, so grading is deterministic and the suite needs no AI provider.
// ============================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseGate } from '@/shared/__tests__/database-gate';

const SUITE = 'custom practice submission concurrency';
const ENABLED = databaseGate(Boolean(process.env.TEST_DATABASE_URL), SUITE);

if (ENABLED && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

describe.skipIf(!ENABLED)('custom practice submission concurrency (real Postgres)', () => {
  let db: typeof import('@/shared/db/db')['db'];
  let repo: typeof import('../repositories/custom-practice-repo');
  let submissionService: typeof import('../services/submission-service');

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ownerId: string;
  let strangerId: string;
  let setId: string;
  let rollbackSetId: string;
  let questionIds: string[] = [];

  beforeAll(async () => {
    ({ db } = await import('@/shared/db/db'));
    repo = await import('../repositories/custom-practice-repo');
    submissionService = await import('../services/submission-service');

    const owner = await db.user.create({ data: { email: `cp-concurrency-${runId}@test.local`, role: 'student' } });
    const stranger = await db.user.create({ data: { email: `cp-stranger-${runId}@test.local`, role: 'student' } });
    ownerId = owner.id;
    strangerId = stranger.id;

    const questions = [
      {
        orderIndex: 0,
        questionType: 'mc',
        instructions: 'Choose the correct option.',
        prompt: 'By the time we arrived, the film ___.  A) started  B) had started  C) starts  D) starting',
        answerKey: 'B',
        acceptedAnswers: '[]',
        rejectedAnswers: '[]',
        rubric: JSON.stringify({ marks: 1, criteria: ['past perfect for the earlier action'] }),
        targetRule: 'past perfect',
        explanationZh: null,
        explanationEn: 'The earlier of two past actions takes the past perfect.',
        misconceptionTags: '[]',
        maxMarks: 1,
      },
      {
        orderIndex: 1,
        questionType: 'fill_blank',
        instructions: 'Complete with the correct form of the verb.',
        prompt: 'She ___ (finish) the report before the meeting started.',
        answerKey: 'had finished',
        acceptedAnswers: JSON.stringify(['had already finished']),
        rejectedAnswers: '[]',
        rubric: JSON.stringify({ marks: 1, criteria: ['past perfect verb form'] }),
        targetRule: 'past perfect form',
        explanationZh: null,
        explanationEn: 'The earlier action takes the past perfect.',
        misconceptionTags: '[]',
        maxMarks: 1,
      },
    ];

    const set = await db.customPracticeSet.create({
      data: {
        ownerUserId: ownerId,
        requestText: 'past perfect vs past simple',
        objective: '[grammar] past perfect vs past simple',
        category: 'grammar',
        difficulty: 'intermediate',
        questionCount: 2,
        promptVersion: 'custom-practice-generation-v1',
        verificationMeta: JSON.stringify({ status: 'verified', rounds: 1 }),
        questions: { create: questions },
      },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    setId = set.id;
    questionIds = set.questions.map(question => question.id);

    // A second, untouched set used for the rollback case.
    const rollbackSet = await db.customPracticeSet.create({
      data: {
        ownerUserId: ownerId,
        requestText: 'present perfect',
        objective: '[grammar] present perfect',
        category: 'grammar',
        difficulty: 'basic',
        questionCount: 1,
        promptVersion: 'custom-practice-generation-v1',
        questions: { create: [questions[0]] },
      },
      include: { questions: true },
    });
    rollbackSetId = rollbackSet.id;
  }, 30_000);

  afterAll(async () => {
    if (ownerId) await db.user.deleteMany({ where: { id: { in: [ownerId, strangerId].filter(Boolean) } } });
  });

  async function submitAs(userId: string, setIdToSubmit: string, delayMs = 0) {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    return submissionService.submitCustomPracticeSet({
      setId: setIdToSubmit,
      ownerUserId: userId,
      answers: { [questionIds[0]]: 'B', [questionIds[1]]: 'had finished' },
    });
  }

  it('C1: two concurrent submissions → exactly one persists, the loser is refused', async () => {
    const answers = { [questionIds[0]]: 'B', [questionIds[1]]: 'had finished' };

    const outcomes = await Promise.allSettled([
      submissionService.submitCustomPracticeSet({ setId, ownerUserId: ownerId, answers }),
      submissionService.submitCustomPracticeSet({ setId, ownerUserId: ownerId, answers }),
    ]);

    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    expect(failure.code).toBe('ALREADY_SUBMITTED');

    const submissions = await db.customPracticeSubmission.count({ where: { setId } });
    expect(submissions).toBe(1);

    // No duplicated or partially persisted grading rows.
    const responses = await db.customPracticeResponse.count({ where: { submission: { setId } } });
    expect(responses).toBe(2);
  }, 30_000);

  it('C2: staggered timing keeps the same guarantee', async () => {
    const answers = { [questionIds[0]]: 'B', [questionIds[1]]: 'had finished' };

    const outcomes = await Promise.allSettled([
      submissionService.submitCustomPracticeSet({ setId, ownerUserId: ownerId, answers }),
      submitAs(ownerId, setId, 25),
      submitAs(ownerId, setId, 60),
    ]);

    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled');
    expect(fulfilled).toHaveLength(0); // the set was already submitted in C1
    for (const outcome of outcomes) {
      const reason = (outcome as PromiseRejectedResult).reason as { code?: string };
      expect(reason.code).toBe('ALREADY_SUBMITTED');
    }
    expect(await db.customPracticeSubmission.count({ where: { setId } })).toBe(1);
  }, 30_000);

  it('C3: a non-owner gets NOT_FOUND and writes nothing, even under concurrency', async () => {
    const strangerSet = await db.customPracticeSet.create({
      data: {
        ownerUserId: ownerId,
        requestText: 'enough and too',
        objective: '[vocabulary] enough and too',
        category: 'vocabulary',
        difficulty: 'basic',
        questionCount: 1,
        promptVersion: 'custom-practice-generation-v1',
        questions: {
          create: [
            {
              orderIndex: 0,
              questionType: 'fill_blank',
              instructions: 'Complete the sentence.',
              prompt: 'The coffee is ___ hot to drink. (too / enough)',
              answerKey: 'too',
              acceptedAnswers: '[]',
              rejectedAnswers: '[]',
              rubric: JSON.stringify({ marks: 1, criteria: ['too + adjective word order'] }),
              targetRule: 'too + adjective',
              explanationZh: null,
              explanationEn: 'too + adjective means more than is wanted.',
              misconceptionTags: '[]',
              maxMarks: 1,
            },
          ],
        },
      },
      include: { questions: true },
    });

    const outcomes = await Promise.allSettled([
      submissionService.submitCustomPracticeSet({
        setId: strangerSet.id,
        ownerUserId: strangerId,
        answers: { [strangerSet.questions[0].id]: 'too' },
      }),
      submissionService.submitCustomPracticeSet({
        setId: strangerSet.id,
        ownerUserId: ownerId,
        answers: { [strangerSet.questions[0].id]: 'too' },
      }),
    ]);

    const strangerOutcome = outcomes[0] as PromiseRejectedResult;
    expect((strangerOutcome.reason as { code?: string }).code).toBe('NOT_FOUND');

    // Exactly the owner's submission exists — the stranger's attempt left nothing.
    const submissions = await db.customPracticeSubmission.findMany({ where: { setId: strangerSet.id } });
    expect(submissions).toHaveLength(1);
    expect(submissions[0].ownerUserId).toBe(ownerId);

    await db.customPracticeSet.delete({ where: { id: strangerSet.id } });
  }, 30_000);

  it('C4: a constraint violation inside the transaction rolls back the whole grading result', async () => {
    const question = await db.customPracticeQuestion.findFirst({ where: { setId: rollbackSetId } });
    expect(question).not.toBeNull();

    await expect(
      repo.createSubmissionWithResponses({
        setId: rollbackSetId,
        ownerUserId: ownerId,
        awardedMarks: 1,
        totalMarks: 1,
        needsReviewCount: 0,
        overallFeedback: 'rollback fixture',
        overallFeedbackZh: null,
        gradingModel: null,
        gradingPromptVersion: 'test',
        responses: [
          {
            questionId: question!.id,
            answerText: 'B',
            verdict: 'correct',
            awardedMarks: 1,
            rationale: 'first',
            rationaleZh: null,
            referenceAnswer: 'B',
            acceptedAlternatives: [],
            improvement: null,
            improvementZh: null,
            needsReview: false,
          },
          {
            // Same question twice → violates @@unique([submissionId, questionId]).
            questionId: question!.id,
            answerText: 'B',
            verdict: 'correct',
            awardedMarks: 1,
            rationale: 'duplicate',
            rationaleZh: null,
            referenceAnswer: 'B',
            acceptedAlternatives: [],
            improvement: null,
            improvementZh: null,
            needsReview: false,
          },
        ],
      })
    ).rejects.toThrow();

    // Nothing survived: no submission row and no orphan responses.
    expect(await db.customPracticeSubmission.count({ where: { setId: rollbackSetId } })).toBe(0);
    const orphanResponses = await db.customPracticeResponse.count({ where: { question: { setId: rollbackSetId } } });
    expect(orphanResponses).toBe(0);
  }, 30_000);
});
