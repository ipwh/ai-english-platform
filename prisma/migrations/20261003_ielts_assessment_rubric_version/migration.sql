-- 2026-10-03 (audit): rubric/spec version stamping on assessments
-- Every persisted writing evaluation must identify the rubric version it was
-- produced under (audit requirement; paired with promptVersion which already
-- exists). Nullable: historical rows predate the stamp and are never backfilled
-- with a fabricated value.

ALTER TABLE "IeltsAssessment" ADD COLUMN "rubricVersion" TEXT;
