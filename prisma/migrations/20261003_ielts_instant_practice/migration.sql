-- 2026-10-03 (VII): IELTS instant self-study practice
-- Adds the delivery-origin discriminator to IeltsTest.
--   origin = 'CATALOGUE' (default): human-reviewed catalogue content.
--   origin = 'INSTANT':  on-demand AI self-study set, deliverable ONLY to its
--                        owner (ownerUserId), never listed in the catalogue.
-- Nothing is backfilled: every existing test row is catalogue content.

ALTER TABLE "IeltsTest" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'CATALOGUE';
ALTER TABLE "IeltsTest" ADD COLUMN "ownerUserId" TEXT;

CREATE INDEX "IeltsTest_origin_ownerUserId_createdAt_idx" ON "IeltsTest"("origin", "ownerUserId", "createdAt");
