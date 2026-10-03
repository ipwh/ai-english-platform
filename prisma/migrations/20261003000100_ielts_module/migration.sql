-- 2026-10-03 PHASE IELTS-01：IELTS 備考子系統（純新增，無破壞性變更）
--
-- 與 HKDSE 完全隔離：不觸碰任何既有表；不寫入 PracticeSession／PracticeAnswer／
-- Mistake／掌握度／XP／HKDSE 證據。所有分數均為平台練習估算（estimate: true）。
--
-- 狀態機：DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED → PUBLISHED（或 REJECTED）；
-- 只有 PUBLISHED 題目會提供給學生，AI 永不自動發佈。
--
-- 人類證據契約：HUMAN_EVIDENCE = INSUFFICIENT；IeltsCalibrationRecord.humanBand
-- 在真實人工評分引入前必須為 NULL（禁止偽造校準資料）。

-- CreateTable
CREATE TABLE "IeltsTest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contentSource" TEXT NOT NULL DEFAULT '{"type":"ORIGINAL_GENERATED"}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsSection" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "instructions" TEXT,
    "passageText" TEXT,
    "transcriptText" TEXT,
    "wordCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsQuestion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sectionId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "questionType" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT,
    "answerKey" TEXT,
    "acceptedAnswers" TEXT,
    "wordLimit" TEXT,
    "evidence" TEXT,
    "explanation" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "difficultyModel" TEXT,
    "contentSource" TEXT NOT NULL DEFAULT '{"type":"ORIGINAL_GENERATED"}',
    "generatorVersion" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'QA_REQUIRED',
    "validationNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "rawScore" INTEGER,
    "totalItems" INTEGER,
    "bandEstimate" TEXT,
    "metadata" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rawAnswer" TEXT NOT NULL,
    "verdict" TEXT,
    "scoringDetail" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT,
    "skill" TEXT NOT NULL,
    "taskType" TEXT,
    "promptVersion" TEXT NOT NULL,
    "assessmentSource" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "failureCode" TEXT,
    "estimatedBand" DOUBLE PRECISION,
    "languageBandEstimate" DOUBLE PRECISION,
    "criteria" TEXT,
    "taskCoverage" TEXT,
    "taskTypeAnalysis" TEXT,
    "prepContent" TEXT,
    "evidence" TEXT,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "pronunciation" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "usage" TEXT,
    "promptHash" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsCalibrationRecord" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "aiBand" DOUBLE PRECISION NOT NULL,
    "humanBand" DOUBLE PRECISION,
    "humanMarkerRef" TEXT,
    "pairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IeltsCalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IeltsTest_slug_key" ON "IeltsTest"("slug");

-- CreateIndex
CREATE INDEX "IeltsTest_testType_skill_status_idx" ON "IeltsTest"("testType", "skill", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsSection_testId_orderIndex_key" ON "IeltsSection"("testId", "orderIndex");

-- CreateIndex
CREATE INDEX "IeltsQuestion_testId_orderIndex_idx" ON "IeltsQuestion"("testId", "orderIndex");

-- CreateIndex
CREATE INDEX "IeltsQuestion_skill_validationStatus_idx" ON "IeltsQuestion"("skill", "validationStatus");

-- CreateIndex
CREATE INDEX "IeltsAttempt_userId_skill_idx" ON "IeltsAttempt"("userId", "skill");

-- CreateIndex
CREATE INDEX "IeltsAttempt_userId_startedAt_idx" ON "IeltsAttempt"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsResponse_attemptId_questionId_key" ON "IeltsResponse"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "IeltsAssessment_userId_skill_createdAt_idx" ON "IeltsAssessment"("userId", "skill", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsCalibrationRecord_assessmentId_key" ON "IeltsCalibrationRecord"("assessmentId");

-- AddForeignKey
ALTER TABLE "IeltsSection" ADD CONSTRAINT "IeltsSection_testId_fkey" FOREIGN KEY ("testId") REFERENCES "IeltsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsQuestion" ADD CONSTRAINT "IeltsQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "IeltsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsQuestion" ADD CONSTRAINT "IeltsQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "IeltsSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAttempt" ADD CONSTRAINT "IeltsAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAttempt" ADD CONSTRAINT "IeltsAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "IeltsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsResponse" ADD CONSTRAINT "IeltsResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IeltsAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsResponse" ADD CONSTRAINT "IeltsResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "IeltsQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAssessment" ADD CONSTRAINT "IeltsAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsAssessment" ADD CONSTRAINT "IeltsAssessment_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IeltsAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsCalibrationRecord" ADD CONSTRAINT "IeltsCalibrationRecord_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "IeltsAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
