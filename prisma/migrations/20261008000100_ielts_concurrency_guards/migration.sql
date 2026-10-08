-- 2026-10-08 (Sprint 131): IELTS concurrency guards.
--
-- F1 — atomic daily generation quota.
-- The on-demand IELTS cap was enforced by a read-check-write
-- (`countInstantTestsCreatedSince()` → `if (count >= cap) reject` → generate),
-- which two concurrent requests can both pass (7 + 7 → two generations, 9 for
-- an 8-cap day). This table becomes the ONLY authoritative gate, reserved by a
-- single atomic conditional UPDATE (`usedCount < cap`), so the DATABASE bounds
-- the count under concurrency.
CREATE TABLE "IeltsGenerationQuota" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsGenerationQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IeltsGenerationQuota_ownerUserId_dayKey_bucket_key" ON "IeltsGenerationQuota"("ownerUserId", "dayKey", "bucket");

-- F2 — at most ONE active attempt per (student, test), enforced by the database.
--
-- `activeKey` holds '<userId>:<testId>' while the attempt is IN_PROGRESS and is
-- cleared to NULL on submission/abandonment. Unique indexes treat NULLs as
-- distinct, so only the single active attempt occupies the key (a `findFirst` +
-- `create` check is not concurrency safe: two simultaneous starts both observe
-- "no active attempt" and both INSERT).
--
-- Nothing is backfilled on purpose: pre-existing IN_PROGRESS rows keep NULL and
-- therefore never occupy the key — a historical duplicate (created by the old
-- race) must not make the unique index impossible to create.
ALTER TABLE "IeltsAttempt" ADD COLUMN "activeKey" TEXT;

CREATE UNIQUE INDEX "IeltsAttempt_activeKey_key" ON "IeltsAttempt"("activeKey");
