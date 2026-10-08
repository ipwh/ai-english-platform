# ADR-049: Database-Enforced Concurrency Guards (IELTS practice, attempts, submissions, generations)

- **Status**: Accepted
- **Date**: 2026-10-08
- **Related**: ADR-043 (delivery integrity, replay safety, roster authorization), ADR-044 (measurable practice), ADR-045 (server-owned listening store), ADR-046 (server-side aggregation, fail-closed sync), ADR-047 (practice content must not repeat), ADR-048 (teacher eligibility)
- **Supersedes**: nothing (extends ADR-043's replay-safety rules to invariants the database must enforce)

## Context

A review of the IELTS subsystem (Sprint 131) found that four invariants necessary for
correctness under concurrency were enforced by application-level **read-check-write**
sequences, and that one error-classification helper silently stopped matching on the
Prisma version this project runs.

1. **The daily on-demand generation cap could be exceeded.**
   `instant-practice-service.ts` counted today's rows
   (`countInstantTestsCreatedSince()`) → `if (count >= cap) reject` → generate. Two
   concurrent requests both read the same count, both pass the check, and both generate
   (measured shape: 7 + 7 → two generations on an 8-cap day). The count was also derived
   from *created* `IeltsTest` rows, so a generation in flight was invisible to it.

2. **A (student, test) pair could accumulate two ACTIVE attempts.**
   `startIeltsAttempt()` did `findFirst({ status: 'IN_PROGRESS' })` then `create()`. Two
   simultaneous starts both observe "no active attempt" and both INSERT, so the student
   ends up with two `IN_PROGRESS` attempts. That breaks the refresh-safe resume contract
   (an unchanged page load must never mint a second attempt) and can produce two
   independent results for one paper.

3. **A submission could finalise twice.**
   Submission was `read status → score → createResponses → update status`. Two concurrent
   submissions of the same attempt could BOTH finalise it: duplicate response rows,
   duplicate completion events, and a response set computed from one request while the
   persisted score came from the other. The ordering also allowed an attempt to end up
   `SUBMITTED` **without** its response rows.

4. **A generation could be persisted half-written.**
   Test, sections and questions were written as independent statements. A failure part-way
   left a truncated test — and an INSTANT (owner-only) test is deliverable at any status
   except `REJECTED`, so the student could open an empty or partial practice set while the
   orphaned rows still occupied a quota slot.

5. **The concurrent-first-submission retry never fired (Prisma 7 metadata drift).**
   `isSubmissionUniqueViolation()` in `assessment/services/submission-attempt-service.ts`
   read `error.meta.target`. Under Prisma 7 with driver adapters / the query compiler
   (this project: `@prisma/client` 7.8.0 + `@prisma/adapter-pg`) `meta.target` is
   `undefined`; the constraint fields live under
   `meta.driverAdapterError.cause.constraint.fields` as SQL-quoted identifiers
   (`'"assignmentId"'`). The predicate was therefore **always false**, so the DB-001 retry
   for a concurrent first submission never ran — the losing request failed with an error
   instead of attaching to the winner's row.

## Decision

1. **The database is the gate for the daily on-demand quota.**
   `IeltsGenerationQuota` — unique `(ownerUserId, dayKey, bucket)` — is the only
   authoritative counter; `reserveInstantQuota()` reserves a slot with a single
   conditional `updateMany({ where: { …, usedCount: { lt: cap } } })`. Postgres takes the
   row lock and the loser re-evaluates the predicate against the winner's committed row,
   matches 0 rows and is refused — so at most `cap` reservations can ever succeed,
   however many requests run concurrently. The first-ever reservation of a
   `(student, day, bucket)` races on the unique index with ONE `create` plus at most one
   conditional re-increment (deliberately loop-free: the N+1 query checker rightly
   rejects queries inside `for` loops). `releaseInstantQuota()` returns the slot when a
   generation persisted **no** test — exactly the cases the old row-counting
   implementation did not count, so the product semantics are unchanged. Buckets are
   independent: `set` (reading/listening single sets + writing tasks, cap 8) and
   `full_component` (cap 2, ~8× the cost). `dayKey` is a **Hong Kong** day
   (`hkDayKey()`), never a UTC day.

2. **At most ONE active attempt per (student, test), enforced by a unique index.**
   `IeltsAttempt.activeKey` holds `'<userId>:<testId>'` while the attempt is
   `IN_PROGRESS` and is cleared to `NULL` on submission or abandonment (SQL unique indexes
   treat NULLs as distinct, so only the single active attempt occupies the key).
   `startIeltsAttempt()` lets the database arbitrate: the loser of the create race gets
   `P2002` and is handed the **winner's** attempt (`findActiveAttemptForTest()`), so both
   callers receive the same coherent result. `force: true` (explicit retake) first retires
   the active attempt through `abandonActiveAttempts()` (status → `ABANDONED`,
   `activeKey` → `NULL`). **Nothing is backfilled on purpose**: pre-existing
   `IN_PROGRESS` rows keep `NULL` and never occupy the key, so a historical duplicate
   cannot make the unique index impossible to create.

3. **Submission finalises exactly once, atomically.**
   `finalizeAttemptSubmission()` is the only way an attempt may move
   `IN_PROGRESS → SUBMITTED`. It performs the conditional status transition
   (`updateMany({ where: { id, userId, status: 'IN_PROGRESS' } })`) **and** the response
   rows in ONE transaction (`{ maxWait: 5_000, timeout: 15_000 }`). The loser matches 0
   rows, rolls its transaction back (so its answers can never be mixed into the winner's
   result) and returns a deterministic `409 ATTEMPT_ALREADY_SUBMITTED`. Only the winner
   emits completion events. Because both writes share the transaction, a `SUBMITTED`
   attempt can never exist without its responses.

4. **A generation is one logical persistence unit.**
   `persistGeneratedTest()` (test + sections + questions + the `QA_REQUIRED` stamp) and
   `persistGeneratedWritingTask()` (test + task section + prompt) run inside a single
   transaction. The AI calls — generation and blind-solve verification — happen
   **before** these functions, so no provider call is ever wrapped in a database
   transaction.

5. **P2002 parsing has exactly one owner: `src/shared/db/prisma-errors.ts`.**
   `isUniqueViolation()` / `uniqueViolationFields()` / `isUniqueViolationOn()` handle both
   the classic `meta.target` shape and the Prisma 7 driver-adapter shape, and normalize
   the SQL identifier quoting. `isSubmissionUniqueViolation()` now delegates to
   `isUniqueViolationOn(err, ['assignmentId', 'studentId'])`; no module parses P2002
   metadata itself. `isUniqueViolationOn()` requires the expected fields to be present, so
   an unrelated unique violation (e.g. `attemptNumber`) never triggers the submission
   retry.

## Consequences

- The daily cap, the single-active-attempt rule and the exactly-once submission are now
  bounded by the database. Application code must not reintroduce
  `count()` → `if (count < cap)` gating, a `findFirst` + `create` "check", or a
  read-status-then-update submission.
- Quota accounting changed from "rows that exist" to "slots reserved and not released".
  The observable semantics are unchanged because a slot is released whenever no test was
  persisted; a failed round that *did* persist a partial test still counts (it is
  deliverable).
- New schema objects: table `IeltsGenerationQuota` and column
  `IeltsAttempt.activeKey` (+ its unique index), added by migration
  `20261008000100_ielts_concurrency_guards`. The push-triggered Cloud Build `Migrate` step
  (`prisma migrate deploy`) applies it; there is no backfill.
- `IeltsGenerationQuota` keeps one row per (student, Hong Kong day, bucket) — it is never
  deleted, so the table grows by at most 2 rows per active student per day.
- Retakes remain available: `activeKey` is released on submission/abandonment, so a
  finished attempt never blocks a new one, and `force: true` retires an unfinished one.
- Concurrent *starts* now return the same attempt id to both callers instead of one
  "already started" error; concurrent *submissions* keep one winner and give the loser a
  `409` it can resolve with `GET`.
- The IELTS concurrency suite is gated on `TEST_DATABASE_URL` (a real Postgres) and is
  therefore skipped in the default local run. `ci.yml` now sets `TEST_DATABASE_URL`, so CI
  executes it; a local run must set the variable (or use a local Postgres) to verify these
  invariants.
- Node/CI alignment (same commit): CI workflows moved to **Node 22** (the Dockerfile
  builder *and* runner are `node:22-alpine`; Prisma 7 requires `^20.19 || ^22.12 || >=24`)
  and `@types/node` was raised to `^22`, so CI no longer type-checks against different
  runtime types than production.

## Evidence

- Real-Postgres integration suite (DB-gated, run by CI):
  `src/modules/ielts/__tests__/ielts-concurrency.integration.test.ts` — F1: 10 concurrent
  reservations against a cap of 8 grant **exactly 8**, one row exists, the 9th request of a
  fresh day is refused, releasing frees exactly one slot, buckets are independent;
  F2: two simultaneous starts yield exactly ONE `IN_PROGRESS` attempt and both callers get
  the same id (a later start resumes it), `force: true` retires the active attempt and
  still leaves exactly one; F3: two identical concurrent submissions have exactly one
  winner and one `409`, two *different* concurrent submissions produce one internally
  consistent result (one response row agreeing with the persisted score), a retry after
  submission is a deterministic `409 ATTEMPT_ALREADY_SUBMITTED` with no extra rows, and
  `activeKey` is `NULL` after submission.
- Unit/contract suites: `src/modules/ielts/__tests__/attempt-service.test.ts`,
  `generation-service.test.ts`, `instant-practice-service.test.ts` (quota injected through
  `reserveQuota` / `releaseQuota` deps; a released slot on typed failure and on thrown
  provider/budget errors; `remainingToday` from the authoritative counter),
  `src/modules/assessment/__tests__/submission-unique-retry.test.ts` and
  `src/shared/db/__tests__/prisma-errors.test.ts` (both P2002 metadata shapes, SQL-quoted
  identifiers, order-insensitive matching, unrelated constraint rejected).
- Prisma metadata shape measured 2026-10-08 against `@prisma/client` 7.8.0 +
  `@prisma/adapter-pg` (recorded in the header of `src/shared/db/prisma-errors.ts`).
- Migration: `prisma/migrations/20261008000100_ielts_concurrency_guards/migration.sql`.
- Full local validation of the change set: `npm test` (3743 passed / 11 skipped),
  `npx tsc --noEmit`, `npx eslint` on the touched files, and `npm run build:prod` all
  green; `package-lock.json` re-synced so `npm ci` (CI and the Docker build) succeeds.
