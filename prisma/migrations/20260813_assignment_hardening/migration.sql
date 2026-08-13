-- ============================================
-- R3.5 hardening: teacher-review marker + per-item uniqueness
--
-- Additive only:
-- 1. Submission.humanReviewedAt — set by the teacher review flow.
--    Marks the submission NOT_PROJECTABLE for item-level projection.
--    No per-item human evidence is fabricated; existing AI/server
--    SubmissionAnswer rows are never relabelled.
-- 2. Unique (attemptId, questionId) on SubmissionAnswer — no duplicate
--    evidence rows for the same question within one attempt.
-- ============================================

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "humanReviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAnswer_attemptId_questionId_key" ON "SubmissionAnswer"("attemptId", "questionId");
