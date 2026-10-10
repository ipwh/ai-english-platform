-- ============================================
-- Self-Directed Practice: bilingual (中英對照) feedback (2026-10-10)
-- ============================================
-- Students reported that the marked feedback was English-only, which defeats
-- self-study for weaker-English students. The Chinese counterpart of each piece
-- of feedback is therefore stored next to its English original, so a reopened
-- practice set keeps showing both languages.
--
-- Additive only: three nullable columns, no existing row is rewritten (NULL
-- means "graded before the bilingual contract existed" / "the marker supplied
-- only English"). Nothing here can destroy data — Cloud Run shifts traffic
-- gradually, so the previous image briefly runs against the new schema and a
-- rollback must stay possible.

-- AlterTable
ALTER TABLE "CustomPracticeSubmission" ADD COLUMN "overallFeedbackZh" TEXT;

-- AlterTable
ALTER TABLE "CustomPracticeResponse" ADD COLUMN "rationaleZh" TEXT;

-- AlterTable
ALTER TABLE "CustomPracticeResponse" ADD COLUMN "improvementZh" TEXT;
