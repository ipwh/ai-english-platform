-- R3.10-K Phase 9 Step 6 (DB-001):
-- Enforce ONE canonical Submission per (assignmentId, studentId).
--
-- Before creating the unique index we must deterministically deduplicate any
-- rows that were produced by the concurrent-first-submission race (or by any
-- other historical path). Strategy:
--   1. Keep the EARLIEST Submission per (assignmentId, studentId)
--      (ordered by createdAt, then id).
--   2. Reassign the duplicate submissions' attempts onto the kept submission,
--      renumbering attemptNumber after the kept submission's existing max so
--      the @@unique([submissionId, attemptNumber]) constraint is preserved.
--      No attempt history is destroyed — every row is auditable.
--   3. Delete the now-empty duplicate Submission rows.
--   4. Create the unique index.

-- Step 1: map every Submission row to the canonical keep_id of its pair.
CREATE TEMP TABLE "_submission_dedupe" AS
SELECT
  id,
  FIRST_VALUE(id) OVER (
    PARTITION BY "assignmentId", "studentId"
    ORDER BY "createdAt" ASC, id ASC
  ) AS keep_id
FROM "Submission";

-- Step 2: reassign attempts of duplicate submissions onto the kept row,
-- renumbering after the kept submission's existing max attempt number.
UPDATE "SubmissionAttempt" a
SET
  "submissionId" = m.keep_id,
  "attemptNumber" = m.base + m.rn
FROM (
  SELECT
    a2.id AS attempt_id,
    s.keep_id,
    (
      SELECT COALESCE(MAX(a3."attemptNumber"), 0)
      FROM "SubmissionAttempt" a3
      WHERE a3."submissionId" = s.keep_id
    ) AS base,
    ROW_NUMBER() OVER (
      PARTITION BY s.keep_id
      ORDER BY a2."createdAt" ASC, a2.id ASC
    ) AS rn
  FROM "SubmissionAttempt" a2
  JOIN "_submission_dedupe" s ON s.id = a2."submissionId"
  WHERE a2."submissionId" <> s.keep_id
) m
WHERE a.id = m.attempt_id;

-- Step 3: delete duplicate Submission rows (attempts already reassigned).
DELETE FROM "Submission" s
USING "_submission_dedupe" d
WHERE s.id = d.id AND d.keep_id <> s.id;

DROP TABLE "_submission_dedupe";

-- Step 4: DB-level uniqueness — the race can never recur.
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key"
  ON "Submission"("assignmentId", "studentId");
