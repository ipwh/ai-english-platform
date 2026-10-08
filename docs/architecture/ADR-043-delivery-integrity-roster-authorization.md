# ADR-043: Delivery Integrity, Replay Safety & Teacher Roster Authorization

- **Status**: Accepted
- **Date**: 2026-09-21
- **Related**: ADR-041 (mistake attribution), ADR-042 (answer verification), ADR-023 (release governance)
- **Extended by**: ADR-048 — §4 (teacher population) now additionally requires a **school-domain** account and defines the class auto-link (§ below)

## Context

An end-to-end student and teacher workflow audit identified coupled integrity risks: delivery paths could bypass independent answer checking; lost HTTP responses could duplicate attempts, notifications, XP, or leave mastery permanently unapplied; and teacher-facing roster logic used inconsistent primary-class, mixed-class (`StudentClass`), Demo, and authorization definitions.

These defects are not merely display issues. They can corrupt persistent learning evidence or expose another teacher's class data.

## Decision

1. **Objective generated questions fail closed before delivery or persistence.** The canonical verifier blind-solves generic questions and reading MC, T/F/NG, cloze, table/cause-effect completion, error-correction summary, and deterministic sequencing. A verifier outage drops the objective item.
2. **Client retries are replay-safe.** Practice sessions, assignment attempts, and completion XP use durable idempotency keys. Assignment keys survive a browser reload in session storage. Server replay does not create a second attempt, notification, or XP event.
3. **Practice mastery is exactly once per persisted session.** `PracticeSession.masteryAppliedAt` is claimed and `StudentMastery` updated in one database transaction. A failed transaction leaves the claim unset, so replay can recover; a completed claim prevents double counting. Replay applies the original persisted session aggregates, never a changed retry payload.
4. **Teacher population is canonical and authorized.** A teacher's student set is the deduplicated union of `User.classId` and `StudentClass`, excluding Demo classes/accounts. This definition applies to roster queries, class detail, Copilot counts, class selectors, group membership, individual assignments, and practice-history access. Admins retain intended cross-class access.
   *2026-10-08 (ADR-048): teacher eligibility is additionally restricted to **school-domain** accounts, and the teacher→class relation is auto-established at account creation — see ADR-048.*
5. **Production deployment applies schema before code.** `prisma migrate deploy` runs with production credentials before Cloud Run deployment; the deployment scripts do not implicitly mutate the database.

## Consequences

- A transient verifier or database-side-effect failure may require a learner retry rather than silently recording partial or untrusted state.
- Teacher actions now reject out-of-roster students rather than permitting cross-class data access or targeting.
- The release requires migrations `20260921_submission_and_xp_idempotency` and `20260922_practice_mastery_idempotency` before the corresponding application revision receives traffic.

## Evidence

- Regression tests cover verifier rejection, reading adaptation, replay keys, XP idempotency, practice mastery contracts, teacher roster/Copilot population, class-targeting, group membership, and teacher practice authorization.
- Release validation on 2026-09-21: 3,092 passed / 1 skipped; i18n, Prisma schema, and TypeScript checks passed.