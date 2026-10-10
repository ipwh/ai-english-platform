// ============================================
// Database test gate (2026-10-10, Sprint 134)
// ============================================
// The PostgreSQL integration suites (IELTS concurrency + retention, submission
// atomicity, evidence-SQL equivalence) skip themselves when no database is
// configured. That is the right behaviour locally — unit tests must run without a
// database — but it also means a release pipeline with a missing or renamed
// connection variable would report SUCCESS while never exercising the invariants
// the release depends on.
//
// `REQUIRE_DATABASE=1` (set by CI) turns "not configured" into a hard collection
// failure instead of a silent skip. Local runs are unaffected: without the flag
// the suites still skip.
//
// Established repo convention: `src/modules/ai/calibration/__tests__/corpus-availability.ts`
// does the same thing for the materials corpus.
// ============================================

/**
 * @param configured whether the suite found a usable database connection
 * @param suite      suite name used in the failure message
 * @returns the value of `configured`, or throws when CI mandates a database
 */
export function databaseGate(configured: boolean, suite: string): boolean {
  if (!configured && process.env.REQUIRE_DATABASE === '1') {
    throw new Error(
      `${suite}: REQUIRE_DATABASE=1 but no database is configured ` +
        `(TEST_DATABASE_URL / DATABASE_URL). Refusing to let this run pass with the ` +
        `PostgreSQL invariants skipped.`,
    );
  }
  return configured;
}
