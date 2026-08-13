-- ============================================
-- R3.3: PracticeAnswer scoring-authority evidence
--
-- Safety notes:
-- - Additive only; both columns NULLABLE (historical rows keep NULL).
-- - scoredBy: 'server' (R3.3 deterministic scorer) | 'client'
--   (reading evaluation forwarded by client — deferred authority).
-- - scoringMethod: evidence-backed labels only, e.g.
--   'deterministic-answer-comparison' | 'reading-evaluation-forwarded'.
-- - No data rewrite, no backfill (historical authority is unknown).
-- ============================================

-- AlterTable: PracticeAnswer
ALTER TABLE "PracticeAnswer" ADD COLUMN "scoredBy" TEXT;
ALTER TABLE "PracticeAnswer" ADD COLUMN "scoringMethod" TEXT;
