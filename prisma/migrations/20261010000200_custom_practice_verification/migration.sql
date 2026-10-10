-- ============================================
-- Self-Directed Practice: blind-verification metadata (2026-10-10, Sprint 141)
-- ============================================
-- Records how a generated set was verified (status, rounds, rejection count and
-- the prompt versions involved) so a grading/quality decision can be audited
-- later. Metadata only: answer keys and verifier answers are never stored here.
--
-- Additive only: this migration adds a single nullable column and rewrites no
-- existing row (NULL means "generated before verification existed").

-- AlterTable
ALTER TABLE "CustomPracticeSet" ADD COLUMN "verificationMeta" TEXT;
