-- ============================================
-- R3.10-D: durable server-owned grammar question definitions
--
-- Additive only:
-- - GrammarQuestion stores the canonical definition (answer key,
--   choices, acceptedAnswers, provenance) for every newly generated
--   grammar question.
-- - Newly persisted grammar questionIds MUST resolve to this table;
--   unresolved ids are NOT_PROJECTABLE (never reconstructed).
-- - Historical client-owned rows are NOT backfilled and remain
--   unverifiable (client-key authority).
-- ============================================

-- CreateTable
CREATE TABLE "GrammarQuestion" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptZh" TEXT,
    "choices" TEXT,
    "answer" TEXT NOT NULL,
    "acceptedAnswers" TEXT,
    "grammarItem" TEXT,
    "languageSkill" TEXT,
    "difficulty" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "explanationZh" TEXT,
    "explanationEn" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'ai-generated',
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrammarQuestion_createdAt_idx" ON "GrammarQuestion"("createdAt");
