-- Replays after a lost client response must not append a second assignment
-- attempt or increment XP twice. Nullable keys preserve historical records.
ALTER TABLE "SubmissionAttempt" ADD COLUMN "clientSubmissionId" TEXT;
CREATE UNIQUE INDEX "SubmissionAttempt_submissionId_clientSubmissionId_key"
  ON "SubmissionAttempt"("submissionId", "clientSubmissionId");

ALTER TABLE "XpTransaction" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "XpTransaction_idempotencyKey_key"
  ON "XpTransaction"("idempotencyKey");