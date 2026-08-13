-- ============================================
-- R3.5: Assignment per-item scoring evidence
--
-- Safety notes:
-- - Additive only: two NEW tables. Existing Submission rows are untouched
--   and remain fully readable (legacy rows simply have no attempts).
-- - SubmissionAttempt = explicit per-submission execution identity.
--   Historical attempts are appended, never overwritten. The existing
--   Submission row remains the "latest attempt" compatibility view.
-- - SubmissionAnswer rows record the per-item evidence produced by the
--   current grader (result/awarded/max/counts/evaluator/method) keyed by
--   the server-owned AssignmentQuestion.id. No backfill of any kind.
-- - evaluator only ever stores frozen AssessmentEvaluator values
--   ('server' | 'ai' | 'human'). No evaluatorVersion column exists —
--   no version source exists, and none is invented.
-- ============================================

-- CreateTable: SubmissionAttempt
CREATE TABLE "SubmissionAttempt" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "score" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SubmissionAnswer
CREATE TABLE "SubmissionAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "awardedScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "countsTowardScore" BOOLEAN NOT NULL,
    "evaluator" TEXT NOT NULL,
    "scoringMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAttempt_submissionId_attemptNumber_key" ON "SubmissionAttempt"("submissionId", "attemptNumber");
CREATE INDEX "SubmissionAttempt_submissionId_idx" ON "SubmissionAttempt"("submissionId");
CREATE INDEX "SubmissionAnswer_attemptId_idx" ON "SubmissionAnswer"("attemptId");
CREATE INDEX "SubmissionAnswer_questionId_idx" ON "SubmissionAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionAnswer" ADD CONSTRAINT "SubmissionAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SubmissionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
