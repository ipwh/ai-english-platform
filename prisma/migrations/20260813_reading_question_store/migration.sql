-- ============================================
-- R3.7: durable server-owned reading question definitions
--
-- Additive only:
-- - ReadingQuestion stores the canonical definition (answer key, marks,
--   choices, dseType) for every newly generated reading question.
-- - Newly persisted reading questionIds must resolve to this table.
-- - Historical rd-* ids are NOT backfilled and remain NOT_PROJECTABLE.
-- ============================================

-- CreateTable
CREATE TABLE "ReadingQuestion" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "dseType" TEXT,
    "questionText" TEXT NOT NULL,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "passageTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingQuestion_createdAt_idx" ON "ReadingQuestion"("createdAt");
