# Calibration Module — Operating Contract (R3.10-F)

**Module**: `src/modules/ai/calibration/` · **Authority class**: EVALUATION INFRASTRUCTURE ONLY

This module manages the platform's authoritative calibration dataset: fixtures
derived from OFFICIAL HKEAA-published material (exemplar booklets, level
descriptors, marking schemes) plus the machinery that measures agreement
between the AI writing pipeline and published values.

---

## 1. What this module is — and is not

| It IS | It is NOT |
|---|---|
| Offline ingestion of official HKEAA source material | A runtime scoring authority |
| Evaluation-only benchmark tooling | A database writer (zero DB access) |
| Provenance-preserving reference data | A source of student scores/levels |
| Policy-gated CI reporting | A claim that the AI is marker-equivalent |

Hard rules (enforced by contract tests in `__tests__/calibration-authority.test.ts`
and `__tests__/release-audit.test.ts`):

1. **No runtime importer.** No API route (`src/app/api/**`) and no
   student/assessment/learning/adaptive domain module may import this module.
   The only allowed external consumers are the combined benchmark runner
   (`src/modules/ai/evaluation/golden-runner.ts`) and the two scripts
   (`scripts/ingest-calibration.ts`, `scripts/calibration.ts`).
2. **No database.** The module neither imports Prisma/`@/shared/db` nor
   performs any network I/O. Ingestion reads local extracted text files only.
3. **No LLM labels.** Ingestion performs no model calls; every value comes
   from deterministic parsing of official text or from explicitly declared
   published numbers.
4. **No fabricated scores.** `published*Score` fields are only ever set from
   officially published numbers. The exemplar booklets publish LEVELS ONLY,
   so in the current dataset every numeric published score is `null` and
   `criterionScoresOfficiallyPublished` is `false` (fail-closed validation
   rejects any criterion score when that flag is false).

---

## 2. Current data availability (verified 2026-08-13)

- The official HKEAA exemplar booklets (2020–2025, Papers 1–4) publish
  **LEVEL labels only** (e.g. "Level 5 exemplar 1").
- Candidate scripts are **handwritten / image-based scans** and are **not
  machine-extractable as authoritative text** — the PDF extraction contains
  page headers and examiner comments only.
- **No numeric marker scores** (overall or criterion-level) are available
  from these sources.
- Consequently, **calibration cannot currently calculate marker agreement.**
  The system reports **INSUFFICIENT AUTHORITATIVE DATA** and makes **no
  claim** of AI-marker equivalence.

---

## 3. Data categories — strictly separated

Four distinct categories exist in this repository. They must never be merged,
and no fixture may silently transition between categories.

| Category | Location | Meaning |
|---|---|---|
| **Official HKEAA source evidence** | `calibration/fixtures/hkeaa/hkeaa-p*.json` | Provenance records parsed from official exemplar booklets; published LEVELS only |
| **Official rubric references** | `calibration/fixtures/hkeaa/hkeaa-leveldescriptors*.json`, `hkeaa-ms-*.json` | Verbatim official level-descriptor / marking-scheme text |
| **Human-marker calibration data** | `calibration/fixtures/human-marker/` — 3 genuine scored scripts ingested in R3.10-G (2018 P2 Q5 M1/M2; 2012 Q9 + 2016 Q4 C/L/O 7-7-7) + `manifest.json` (source hashes, owner authority assertion) | Genuine human-marker-scored scripts with provenance and source hashes; the only category that may carry numeric marker scores |
| **Synthetic regression fixtures** | `src/modules/ai/evaluation/fixtures/writing-golden/` | Platform-generated drafts; `expected` scores are null; used for deterministic/structural regression ONLY |
| **Model-generated evaluation data** | produced at runtime by `analyzeWriting` / the benchmark runners | Never stored as fixtures; only compared against published values in reports |

Classification rule (`classifyFixtureKind`): a fixture is authoritative **iff**
`provenance.sourceOrganization === "hkeaa"`. Everything else is synthetic.
Synthetic fixtures never carry HKEAA provenance, so a transition requires
creating a *new* authoritative fixture — mutation of a synthetic fixture into
an authoritative one is impossible by construction.

---

## 4. What is required to move from INSUFFICIENT_DATA to a PASS

`INSUFFICIENT_DATA` is the correct fail-closed state until ALL of the
following exist. The accepted evidence shape is codified in
`HumanMarkerCalibrationFixture` (validated fail-closed by
`validateHumanMarkerFixture` / `validateHumanMarkerEvidenceSet`); the
intake contract and checker are `intake.ts`
(`checkHumanMarkerEvidenceIntake` + 7-level provenance quality model),
and the full acceptance procedure is documented in
`fixtures/human-marker/README.md` (R3.10-J acquisition specification).

1. **Genuine human-marker-scored scripts** — real candidate responses scored
   by human markers under a defined marking policy. Scores may never be
   inferred from published levels, converted from totals, or generated by
   the AI being evaluated.
2. **Provenance** for every scored script: source organization, document,
   year, paper, task identifier, and marking context.
3. **Script text** — full, verbatim candidate response text.
4. **Task metadata** — the exact writing task/prompt the candidate answered.
5. **Criterion scores where applicable** — Content / Language / Organization
   only when the marking source genuinely publishes them; otherwise the
   fixture must remain overall-only.
6. **Marker identity/policy** — enough information to establish who marked
   the script and under what policy (e.g. single marker, double marking).
7. **Rubric version** — the rubric reference against which the mark was made.
8. **Immutable source hash** — SHA-256 over the canonical source slice, so
   every expected value can be traced to its origin.
9. **Sufficient sample size** — at least `minAuthoritativeSamples` fixtures
   and `minScoredSamples` scored fixtures, per the gate policy in
   `gates.ts` (configurable POLICY, not a fact).

Only when scored samples satisfy all policy thresholds may the gate return
`PASS` — and even then, a PASS is a *policy* statement ("current thresholds
are met"), never a claim of HKDSE marker equivalence.

---

## 5. Ingestion operating rules

- `npm run calibration:ingest` — deterministic, offline, no DB.
- **Idempotent**: re-running over unchanged sources writes nothing
  (`Unchanged: N`).
- **Fail closed**: validation failure aborts the run; a content conflict
  under an existing artifact id aborts unless `--force-new-version` is given,
  in which case a NEW versioned artifact is created and the original is
  never mutated.
- **Quarantine, never guess**: ambiguous extraction is recorded in
  `fixtures/hkeaa/quarantine.json` with reason codes; duplicate source
  samples are quarantined as `duplicate-source-sample`.
- Source files are listed in a fixed inventory (`ingestion/ingest-hkeaa.ts`);
  a missing source file throws.

## 6. Report interpretation

`npm run calibration:report` prints a Markdown report with two independent
sections:

- **REGRESSION** — software behavior status over synthetic fixtures
  (expected scores may be null). A software test signal, nothing more.
- **CALIBRATION** — agreement with a scored dataset: sample counts,
  scored/unscorable/quarantined counts, MAE/RMSE/bias, exact/±1
  agreement, over/under-scoring rates, per-level/per-year/per-task
  breakdowns, per-marker-policy breakdown (human-marker evidence),
  and criterion-level statistics **only where criterion scores were
  genuinely supplied** (overall-only evidence never generates
  criterion numbers).

The **CALIBRATION GATE** reports `PASS`, `FAIL`, or `INSUFFICIENT_DATA`.
Thresholds are **policy configuration** (`gates.ts`), not official HKEAA
validity standards. Exit codes: `0` = PASS, `1` = FAIL, `2` = INSUFFICIENT_DATA.
When authoritative data is insufficient the report says
**INSUFFICIENT AUTHORITATIVE DATA** and never claims marker equivalence.

### Gate semantics (exact PASS conditions)

A PASS requires ALL of the following against the scored dataset:

| Condition | Policy value |
|---|---|
| scored samples ≥ `minScoredSamples` | 8 |
| dataset samples ≥ `minAuthoritativeSamples` | 10 |
| overall MAE ≤ `maxOverallMAE` | 1.5 |
| overall RMSE ≤ `maxOverallRMSE` | 2.0 |
| \|overall bias\| ≤ `maxAbsBias` | 1.0 |
| exact agreement ≥ `minExactAgreementRate` | 0.5 |
| ±1 agreement ≥ `minWithinOneAgreementRate` | 0.8 |

Deliberate policy decisions (NOT thresholds invented for this phase):
- Criterion metrics are **reported but do not gate PASS** — criterion
  scores are legitimately absent from many sources, and their absence
  must never invalidate an otherwise valid overall comparison.
- There are **no per-level or per-criterion minimum sample counts**;
  per-group tables are reported for transparency but sufficiency is
  governed only by the counts above.
- All thresholds are configuration; adjusting them is a policy change,
  never an evidence claim.

## 7. Determinism contract

- Fixture files: sorted by id; serialization with fixed field order; SHA-256
  source hashes recorded at ingestion.
- Report generation: deterministic given the fixture set and analyzer; the
  `generatedAt` timestamp is injectable (`now` option) and the CLI accepts
  `--now=<ISO>` for byte-reproducible reports.
- Metrics: single owner (`metrics.ts`); the golden regression runner shares
  the same `mean`/`rmse` helpers — one definition of MAE/RMSE in the codebase.
