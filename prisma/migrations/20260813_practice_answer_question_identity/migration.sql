-- ============================================
-- R3.1–R3.2: PracticeAnswer canonical question identity + scoring persistence
--
-- Safety notes:
-- - All new columns are NULLABLE. Historical PracticeAnswer rows keep
--   questionId = NULL (canonical identity was permanently lost for them;
--   we do NOT fabricate IDs). New rows are required to provide
--   questionId at the application boundary (see /api/practice).
-- - The unique index (sessionId, questionId) is compatible with existing
--   data: PostgreSQL treats NULL questionId rows as distinct, so legacy
--   rows cannot collide. For new rows the index enforces that a question
--   appears at most once per session.
-- ============================================

-- AlterTable: PracticeAnswer
ALTER TABLE "PracticeAnswer" ADD COLUMN "questionId" TEXT;
ALTER TABLE "PracticeAnswer" ADD COLUMN "result" TEXT;
ALTER TABLE "PracticeAnswer" ADD COLUMN "awardedScore" DOUBLE PRECISION;
ALTER TABLE "PracticeAnswer" ADD COLUMN "maxScore" DOUBLE PRECISION;
ALTER TABLE "PracticeAnswer" ADD COLUMN "countsTowardScore" BOOLEAN DEFAULT true;

-- CreateIndex (unique on (sessionId, questionId); NULL-safe for legacy rows)
CREATE UNIQUE INDEX "PracticeAnswer_sessionId_questionId_key" ON "PracticeAnswer"("sessionId", "questionId");
