-- ============================================
-- R3.10-E.2 P0-3: PracticeSession clientSubmissionId
--
-- Additive, nullable: historical rows remain null (backward compatible).
-- Uniqueness is per student — the idempotency key is ONLY a replay/
-- dedup mechanism, never an authority signal.
-- ============================================

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN "clientSubmissionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSession_studentId_clientSubmissionId_key"
ON "PracticeSession"("studentId", "clientSubmissionId");
