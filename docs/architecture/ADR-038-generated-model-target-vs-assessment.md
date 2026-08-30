# ADR-038: Generated Model Target vs Assessment Result — Two Distinct Concepts

- **Status**: Accepted
- **Date**: 2026-08-14
- **Revised**: 2026-08-29 — 「範文目標 Level N」標籤恢復顯示（連同免責聲明）；ADR-038 要求先前的移除已逆轉
- **Phase**: R3.10-K Phase 5

## Context

The student writing page offers a "Generate Mid-Level Model" feature. The
generator knows it is creating a Level 3-targeted pedagogical model, but the
generated text was returned as a bare `{ essay }`. When a student fed that
model back into the canonical scorer, the platform estimated level could be
Level 5 — producing the confusing product state "the system generated a
mid-range model, but analysis says Level 5".

This is not a canonical-scorer bug. It is a domain-modelling gap:
**Pedagogical Target** and **Assessment Result** were never modelled as two
distinct concepts.

## Decision

1. Introduce the `WritingArtifactMetadata` contract
   (`src/modules/ai/core/writing-artifact.ts`):
   - `source` — where the writing came from
     (`student_submission` | `generated_model` | `teacher_example` |
     `imported_example`)
   - `pedagogicalTargetLevel` — the learning level the artifact was designed
     to illustrate. **Generation metadata only.**
   - `generationTarget` (`low` | `mid` | `high`) — human-readable target.
   - `generationVersion` — `MODEL_ESSAY_GENERATION_V1` (independent from
     `scoringVersion`).
   - `qualityStatus` — `verified` | `unverified`.

2. The generation target mapping is **server-determined and deterministic**
   (`generationTargetToPedagogicalLevel`: low→2, mid→3, high→5,
   PLATFORM_DEFINED). The LLM writes only the essay text and can never set
   the target.

3. The generation endpoint (`/api/ai/generate-model-essay`) returns
   `{ essay, metadata }` and enforces a **pedagogical quality gate**
   (booleans only — never a score or level) with at most
   `MODEL_ESSAY_MAX_ATTEMPTS` attempts. On exhaustion it fails closed with
   `MODEL_GENERATION_UNAVAILABLE` (HTTP 503) — an unverified essay is never
   silently labelled as a Level-targeted model.

4. The canonical scorer accepts optional `artifact` metadata as
   **echo-only context**. It is never read by C/L/O, cloTotal, overallScore,
   dseLevel, or penalties. Client-supplied artifact metadata can never alter
   scoring.

5. The UI displays the model card with the pedagogical-target label
   「範文目標 Level N」plus the disclaimer 「這是平台生成的學習範文，並非你的作文」, and an optional
   "獨立分析範文" action that shows the independent platform estimate only.

   *(Revised 2026-08-22)* The original 「範文目標 Level N」 label and the
   side-by-side dual-track explanation were removed at product request: the
   button copy became 「生成範文」(Generate Model Essay).

   *(Revised 2026-08-29)* The 「範文目標 Level N」 label was restored
   (CHANGELOG 2026-08-29 VIII) because hiding the target confused students
   about which level the model illustrates. `pedagogicalTargetLevel`
   remains server-determined provenance metadata, and the label is paired
   with the "not your essay" disclaimer.

## Consequences

- A generated model may legitimately carry
  `pedagogicalTargetLevel = 3` while independent analysis reports
  platform-estimated level 5. This is not a contradiction.
- Assessment results never overwrite pedagogical targets, and pedagogical
  targets never enter the scoring formula (double isolation).
- Unknown historical artifacts are never guessed: absence of metadata means
  the source is unknown, never retroactively `generated_model`.

## Invariants (enforced by tests)

A. Generated-model target metadata never changes C/L/O.
B. Generated-model target metadata never changes overallScore.
C. Generated-model target metadata never changes canonical dseLevel.
D. Assessment results never overwrite pedagogicalTargetLevel.
E. Generated-model source identity survives the API/UI lifecycle.
F. Unknown historical artifact metadata is never guessed.
G. Generation target mapping is deterministic.
H. LLM cannot override generation target metadata.
I. Client cannot manipulate target metadata to alter scoring.
J. The generation quality gate cannot create a second scoring authority.

## Semantic Rules (R3.10-K Phase 6)

1. Target is not score.
2. Target is not ceiling.
3. Target is not guarantee.
4. Assessment cannot rewrite target.
5. Target cannot influence assessment.
6. Generation metadata is provenance.
7. Canonical scoring is the only production assessment authority.
8. Quality gate is not an assessment authority.
9. Platform conversions are PLATFORM_DEFINED unless explicitly supported by an official source.
10. A generated model may legitimately receive an assessment result different from its pedagogical target (e.g. target Level 3, independent platform estimate Level 5) — this is NOT a contradiction.

## Copy-to-Draft Semantics

When a student copies a generated model's text into their own draft (manual
copy-paste; the product currently has no copy button), the resulting text is
a NEW STUDENT SUBMISSION:
- assessment identity = student draft (the UI must not label it a generated model);
- generation provenance is NOT retroactively attached to manual copies;
- canonical scoring never reads provenance of any kind.
A future explicit "use this model as a draft template" action, if added, MUST
carry origin provenance (originGenerationVersion / originPedagogicalTargetLevel)
without ever letting those fields influence scoring.

## Calibration Authority & Evidence Integrity (R3.10-K Phase 7)

The calibration module (`src/modules/ai/calibration/`) measures agreement
between the canonical scorer and human reference values. Its authority
boundaries are now explicit:

1. **Calibration never mutates scoring policy.** `SCORING_VERSION` and every
   formula in `writing-score-policy.ts` are untouched by calibration. The
   only scoring-policy coupling is metadata plumbing: the runner records
   `scoringVersion` for attribution.
2. **Human reference is the only ground truth source.** No LLM output, AI
   scorer, generation output, RAG content, or runtime student data may write
   fixtures. Fixtures are human-derived, hash-protected
   (`sourceHash`), git-tracked, and runtime read-only (no API route reads or
   writes them — enforced by tests).
3. **INSUFFICIENT_DATA ≠ PASS ≠ FAIL ≠ VALIDATED.** With zero comparable
   evidence the gate returns `INSUFFICIENT_DATA`, the report states
   "ASSESSMENT VALIDITY IS NOT ESTABLISHED", and CI treats exit 2 as
   non-blocking-with-warning (exit 0 = PASS, exit 1 = FAIL blocks).
4. **Every run is attributable.** Reports carry `CalibrationRunMetadata`
   (calibrationVersion, datasetVersion, datasetFingerprint, scoringVersion,
   promptVersion from the canonical registry, provider/model/temperature,
   commitSha). Unknown values are rendered `unavailable` — never fabricated.
5. **Levels are ordinal.** `levelMetrics` reports absolute level distance
   (Level 4→5 is distance 1; Level 4→1 is distance 3), never conflating them
   as "one mismatch".
6. **Dimension gates.** `maxContentMAE` / `maxLanguageMAE` /
   `maxOrganizationMAE` are POLICY_DEFINED (not official tolerances) and
   evaluated only when criterion data exists.
7. **Evidence verification is explicit.** Third-party-hosted sources carry
   `verificationRequired: true` + `verificationStatus: "unverified"` until
   independently verified. Unverified evidence is never described as
   verified/official ground truth.
8. **No leakage.** Human-marker scored scripts are structurally excluded
   from RAG indexing (`rag-exclusion.ts`); regression goldens saved from AI
   output are labelled `AI_AUTHORED_REGRESSION_BASELINE`, a distinct
   semantic identity from `HUMAN_MARKER_GROUND_TRUTH`.

Authority diagram:

```
HUMAN MARKER ──▶ CALIBRATION ENGINE ──▶ METRICS ──▶ GATE ──▶ CI RELEASE SIGNAL
                     │
                     X  (never)
                     ▼
              SCORING POLICY / RUNTIME SCORE / RAG
```
