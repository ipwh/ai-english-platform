# ADR-039: Human-Marker Evidence Acquisition Pipeline — Fail-Closed

- **Status**: Accepted
- **Date**: 2026-08-17
- **Phase**: R3.10-K Phase 9

## Context

The calibration gate requires ≥8 **verified overall-comparable pairs**
before any marker-agreement metric can be trusted. An audit of real-world
sources (Phase 9 Steps 3-4) established two hard facts:

1. HKEAA publishes exemplar scripts with **levels and examiner comments
   only** — per-script numeric marks (C/L/O/overall) are never published.
2. No public dataset pairs authentic HKDSE scripts with numeric human
   scores.

Without a governed acquisition path, there is a real risk that
well-intentioned evidence (level-only booklets, OCR transcriptions,
AI-generated goldens, "graded sample" compilations) gets mistaken for
human-marker ground truth and quietly pollutes the calibration dataset.

## Decision

Evidence enters the calibration dataset through a single, fail-closed
pipeline — `intake → verify → marker-pack → adjudication → freeze`:

1. **Intake** (`ai/calibration/intake-service.ts`): the only entry point
   for external evidence. `scriptAuthorship: "human-authored"` is
   mandatory; every submission starts `verificationStatus: "unverified"`;
   level-only submissions are REJECTED. LEVEL_ONLY ≠ human-marker
   evidence.
2. **Verification** (`VerificationRecord` in `types.ts`): a fixture
   becomes VERIFIED only with `verifiedBy` + `verifiedAt` +
   `confirmedSourceHash === sourceHash`. Fixtures without a record
   resolve to `unverified` via `effectiveVerificationStatus()`.
3. **Marker packs** (`ai/calibration/marking.ts`): `buildMarkerPack()`
   carries no AI fields; `appendMarkerScore()` is append-only;
   `applyAdjudication()` resolves marker disagreement without ever
   mutating original marks.
4. **Freeze** (`ai/calibration/freeze.ts`): writes
   `frozen-manifest.json` + `frozen-inventory.json` and cross-checks
   manifest / inventory / dataset fingerprint. It FAILS CLOSED on
   malformed evidence, AI-authored or unknown authorship, unverified
   COMPARABLE fixtures, and fingerprint mismatch at the same dataset
   version.
5. **Fingerprint** (`version.ts`): the dataset fingerprint hashes the
   full ground-truth identity including verification fields
   (`verifiedBy` / `verifiedAt` / `scriptAuthorship`) — verification
   state changes are detectable mutations.
6. **Gate sufficiency** counts ACTUAL verified comparable pairs that
   entered the metrics — never merely verified fixtures
   (criterion-only, scope-excluded, or failed fixtures never count).

## Consequences

- Current state is honestly reported: **0 verified comparable pairs**,
  gate `INSUFFICIENT_DATA` (exit 2). No validity claims.
- The only path to calibrated marker agreement is to recruit ≥2 human
  markers to blind-mark authentic scripts with the CLO rubric (explicit
  C/L/O + overall /21 per marker), then run this pipeline.
- Third-party OCR downloads of official booklets are excluded from the
  repository (`.gitignore`) and can never reach RAG, prompts, or the
  runtime scorer.
- Level-only official exemplars remain usable only as
  `HUMAN_PUBLICATION_LEVEL_ONLY` reference material — never as scoring
  ground truth.
