-- ============================================
-- Self-Directed Practice (2026-10-10, Sprint 140)
-- ============================================
-- Student-authored practice requests: the student states their own learning need,
-- the server normalizes it into a typed specification, generates questions and
-- grades the submission server-side.
--
-- Additive only: every statement creates a NEW object and none can destroy
-- existing data, because Cloud Run shifts traffic gradually — the previous image
-- briefly runs against the new schema and a rollback must stay possible. (The
-- migration-safety guard scans this file for destructive shapes; note that even
-- naming such a shape in prose trips it, so the guard is described rather than
-- quoted here.)
--
-- Isolation: these tables never feed HKDSE evidence / accuracy / mastery /
-- mistakes / XP — AI-generated, non-human-validated items must not move a
-- student's DSE metrics (same rule as the IELTS subsystem).

-- CreateTable
CREATE TABLE "CustomPracticeSet" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "interpretation" TEXT,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPracticeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeQuestion" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "acceptedAnswers" TEXT NOT NULL DEFAULT '[]',
    "rejectedAnswers" TEXT NOT NULL DEFAULT '[]',
    "rubric" TEXT NOT NULL,
    "targetRule" TEXT NOT NULL,
    "explanationZh" TEXT,
    "explanationEn" TEXT NOT NULL,
    "misconceptionTags" TEXT NOT NULL DEFAULT '[]',
    "maxMarks" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CustomPracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeSubmission" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),
    "awardedMarks" INTEGER,
    "totalMarks" INTEGER,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "overallFeedback" TEXT,
    "gradingModel" TEXT,
    "gradingPromptVersion" TEXT,

    CONSTRAINT "CustomPracticeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPracticeResponse" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "awardedMarks" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "referenceAnswer" TEXT NOT NULL,
    "acceptedAlternatives" TEXT NOT NULL DEFAULT '[]',
    "improvement" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPracticeResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomPracticeSet_ownerUserId_createdAt_idx" ON "CustomPracticeSet"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPracticeQuestion_setId_orderIndex_key" ON "CustomPracticeQuestion"("setId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPracticeSubmission_setId_key" ON "CustomPracticeSubmission"("setId");

-- CreateIndex
CREATE INDEX "CustomPracticeSubmission_ownerUserId_submittedAt_idx" ON "CustomPracticeSubmission"("ownerUserId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPracticeResponse_submissionId_questionId_key" ON "CustomPracticeResponse"("submissionId", "questionId");

-- AddForeignKey
ALTER TABLE "CustomPracticeSet" ADD CONSTRAINT "CustomPracticeSet_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeQuestion" ADD CONSTRAINT "CustomPracticeQuestion_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CustomPracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeSubmission" ADD CONSTRAINT "CustomPracticeSubmission_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CustomPracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeResponse" ADD CONSTRAINT "CustomPracticeResponse_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CustomPracticeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPracticeResponse" ADD CONSTRAINT "CustomPracticeResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CustomPracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
