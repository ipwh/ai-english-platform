# Phase 9 — Release Authorization Record

**Date**: 2026-08-20
**Authorized by**: Release Authority (system owner)
**Decision rule**: ADR-023 (amended) — `OP-001 == VERIFIED OR ACCEPTED_WITH_EXPLICIT_WAIVER`, `OP-002 == VERIFIED`, `OP-003 == VERIFIED`, `P0 == 0`, `P1 == 0`, `calibration gate == INSUFFICIENT_DATA`

## Release Authority Decision

> The DeepSeek production credential will remain active and will not be rotated
> at this time. The Release Authority knowingly accepts the residual security
> risk associated with this decision. This acceptance is an explicit
> release-policy waiver and must not be represented as successful credential
> rotation.

This decision is authoritative for this release and is recorded under the
waiver policy formalized in `docs/architecture/ADR-023-phase9-external-release-gate.md`.

## OP-001 — Credential Rotation

```
STATUS = ACCEPTED_WITH_EXPLICIT_WAIVER
```

| Credential | Outcome | Evidence |
|---|---|---|
| Neon DB password | ROTATED — VERIFIED | new CONNECT_OK; old 28P01 rejected; Cloud Run env updated (revision 00053) |
| AUTH_SECRET | ROTATED — VERIFIED | deployed in Cloud Run env (revision 00051); old sessions invalidated; health/login 200 |
| JWT_SECRET | ROTATED — VERIFIED | production differential: old-secret token 401, new-secret token 200 |
| GCP service-account | ROTATED — VERIFIED | exposed key `5fb61327…` deleted; old key invalid_grant rejected; new key `04658460…` active (Secret Manager v2) |
| Gemini | RETIRED — VERIFIED | key revoked (GCP API key deleted); old key 401; env removed (revision 00055); geminiApiKey=false in production |
| DeepSeek | ACCEPTED_WITH_EXPLICIT_WAIVER | rotation NOT PERFORMED; old-value rejection NOT VERIFIED; waiver explicitly approved by Release Authority; residual risk ACCEPTED |

DeepSeek is NOT recorded as rotated. No claim of old-value rejection exists for it.

## OP-002 — Git History Purge

```
STATUS = VERIFIED
remote main = 0f3561a285550a2c077287489ae104ccb3a75fd1
cloud-run-env.yaml reachable = NO
known secret blobs reachable = NO
fresh clone verification = PASS
```

## OP-003 — Production Database Migration

```
STATUS = VERIFIED
migration = 20260819_submission_unique_assignment_student
deployed = PASS (production)
schema up-to-date = PASS
Submission_assignmentId_studentId_key = PRESENT
duplicate groups = 0 (pre) → 0 (post)
attempt integrity = PASS (1→1 submissions, 0→0 attempts)
constraint behavior = PASS (duplicate insert blocked 23505 inside rollback transaction)
```

## Final Authorization

```
FINAL RELEASE DECISION = GO
```

Under ADR-023: OP-001 = `ACCEPTED_WITH_EXPLICIT_WAIVER` (satisfies the amended
condition), OP-002 = VERIFIED, OP-003 = VERIFIED, P0 = 0, P1 = 0,
calibration gate = INSUFFICIENT_DATA (exit 2).

## Mandatory Distinction

`PRODUCTION READINESS = GO` is a release-governance state. It does NOT establish
scoring validity:

```
HUMAN EVIDENCE = INSUFFICIENT
MARKER EQUIVALENCE = UNPROVEN
HKDSE VALIDITY = NOT ESTABLISHED
```

The AI scoring system remains explicitly unvalidated against sufficient
human-marker evidence. No release authorization may be cited as marker
equivalence or HKDSE validity.
