-- ============================================
-- R3.10-E.2 P0-2: Mistake uniqueness (studentId, questionId)
--
-- 1. Deterministic dedupe: keep the NEWEST record per (studentId, questionId).
--    Tie-break (same createdAt): keep the lexicographically smaller id.
-- 2. Enforce uniqueness for all future inserts.
-- ============================================

-- Deduplicate historical duplicates (keep newest createdAt, tie-break by id)
DELETE FROM "Mistake" AS a
USING "Mistake" AS b
WHERE a."studentId" = b."studentId"
  AND a."questionId" = b."questionId"
  AND (
    a."createdAt" < b."createdAt"
    OR (a."createdAt" = b."createdAt" AND a."id" > b."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_studentId_questionId_key" ON "Mistake"("studentId", "questionId");
