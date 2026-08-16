# ADR-038: Generated Model Target vs Assessment Result — Two Distinct Concepts

- **Status**: Accepted
- **Date**: 2026-08-14
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

5. The UI displays the model card with a "範文目標 Level N" label and an
   optional "獨立分析範文" action that shows **both tracks side by side**
   (target vs independent platform estimate), with an explanation that the
   two levels serve different purposes.

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
