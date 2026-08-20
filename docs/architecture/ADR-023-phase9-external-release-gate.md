# ADR-023: Phase 9 External Release Gate & Credential Rotation Waiver Policy

**Date**: 2026-08-20
**Status**: Accepted
**Author**: Release Authority (system owner)

## Context

Production release authorization for the AI English Platform is gated on three
external conditions:

- **OP-001** — Credential rotation for six historically exposed production credentials
  (Neon DB password, AUTH_SECRET, JWT_SECRET, DeepSeek API key, Gemini API key,
  GCP service-account key).
- **OP-002** — Git history purge of secret-bearing objects.
- **OP-003** — Production database migration `20260819_submission_unique_assignment_student`.

During Phase 9 execution, four credentials were rotated with direct new-active /
old-rejected evidence. Gemini was permanently retired (credential revoked, configuration
removed) rather than rotated. The Release Authority chose to **waive** rotation of the
DeepSeek credential while keeping it active.

## Decision

### 1. Credential Rotation Waiver Policy

A credential rotation is normally required when a production credential has
historical exposure. A Release Authority may explicitly accept the residual risk
instead of requiring rotation only when ALL of the following hold:

1. The Release Authority explicitly authorizes the waiver.
2. The credential remains necessary for the current production system.
3. The residual risk is explicitly documented.
4. The waiver is recorded as `ACCEPTED_WITH_EXPLICIT_WAIVER`.
5. The waiver is never represented as successful credential rotation.
6. No stronger organizational, contractual, or legal requirement mandates rotation.
7. The final release authorization explicitly records the waiver.

`ACCEPTED_WITH_EXPLICIT_WAIVER` and `VERIFIED` are distinct states and MUST NOT
be collapsed. A waiver does not create evidence of old-value rejection.

### 2. Amended Release Decision Rule

Original rule required `OP-001 == VERIFIED`. The amended rule is:

```
OP-001 == VERIFIED
OR
OP-001 == ACCEPTED_WITH_EXPLICIT_WAIVER

AND OP-002 == VERIFIED

AND OP-003 == VERIFIED

AND P0 == 0

AND P1 == 0

AND calibration gate == INSUFFICIENT_DATA
```

Only this policy condition changed. P0/P1 requirements, calibration requirements,
evidence requirements, security invariants, authentication/authorization requirements,
database-integrity requirements, migration requirements, credential-secrecy
requirements, and CI truthfulness requirements are NOT weakened by this ADR.

### 3. Scope of the Waiver

The waiver is specifically scoped to the DeepSeek credential rotation decision
for this release. It does not extend to any other credential, and it does not
affect any evidence or calibration gate.

### 4. Gemini Retirement

Gemini is permanently retired:

```
production usage        = NONE
production configuration = REMOVED
credential              = REVOKED
old key rejection       = VERIFIED
retirement              = VERIFIED
```

Gemini must not be restored, re-keyed, or reintroduced into the provider chain
without a new architectural decision.

## Consequences

- The release authorization contract distinguishes `VERIFIED` from
  `ACCEPTED_WITH_EXPLICIT_WAIVER` permanently.
- `PRODUCTION READINESS` (a release-governance state) remains strictly separate
  from `HKDSE SCORING VALIDITY` (an evidence state). Release authorization never
  implies marker equivalence or scoring validity.
- Calibration states are unchanged:
  `HUMAN EVIDENCE = INSUFFICIENT`, `MARKER EQUIVALENCE = UNPROVEN`,
  `HKDSE VALIDITY = NOT ESTABLISHED`.
