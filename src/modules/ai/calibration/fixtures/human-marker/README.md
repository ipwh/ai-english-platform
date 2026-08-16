# Human-Marker Calibration Evidence — Ingestion Contract

**Current state (R3.10-G/H/I): 3 genuine human-marker fixtures ingested**
from the owner-supplied 2018 scored-scripts PDF (2018 Part B Q5 with
published M1/M2 double-marking sub-scores; 2012 Q9 and 2016 Q4 with
published C:7 L:7 O:7). All carry the SHA-256 of the exact source PDF.
Evidence classification (`inventory.json`): 2 ×
`ACCEPT_CRITERION_ONLY`, 1 × `NON_COMPARABLE_SCORE`, 0 ×
`ACCEPT_OVERALL_SCORE`; summary block reports all 7 classes and
`inferredScores: 0`. The 2019 PDF is an image-only scan (no text
layer) and is recorded in the manifest as non-authoritative until
manually transcribed. The Sample Essay / Vocab PDF is classified
teaching-reference and is NOT calibration evidence. A repository-wide
search (R3.10-H/I) found no other local source publishing explicit
overall scores, so the dataset remains far below the gate policy
minimums (needs ≥8 overall-comparable scripts).

This document defines EXACTLY what evidence is accepted and how.

## Phase 7: Source Verification Policy

The source PDFs are **third-party-hosted** (not hkeaa.edu.hk). Every
fixture and manifest entry therefore declares
`verificationRequired: true` and `verificationStatus: "unverified"` —
owner assertions are provenance metadata only. These fixtures are usable
as evidence but are **NOT verified ground truth**, and no report, test, or
document may describe them as verified/official/authoritative human-marker
evidence. `verificationStatus` may only become `"verified"` through an
explicit, documented independent verification act.

## R3.10-J: HUMAN MARKER EVIDENCE ACQUISITION SPECIFICATION

**The current bottleneck is NOT software capability — it is genuine
human-marker evidence acquisition.** The repository requires **8
additional genuine overall-comparable scripts** to reach
`minScoredSamples = 8` (3 existing fixtures + 8 = 11, satisfying
`minAuthoritativeSamples = 10`). 8 scripts is the minimum evidence
QUANTITY, not a guarantee of calibration validity: MAE, RMSE, bias,
exact/±1 agreement, subgroup behavior, task/year distribution, and
marker disagreement are still evaluated afterwards.

### Intake workflow (future evidence)

```
materials/_hkeaa_scored_scripts/incoming/     (owner drops new sources here)
  → checkHumanMarkerEvidenceIntake            (intake.ts — field-by-field report)
  → classify provenance quality                (7-level provenance model)
  → duplicate / conflict detection             (same script + same score+hash = DUPLICATE;
                                                same script + different score or hash = CONFLICT)
  → accept / quarantine                        (no silent upgrades between classes)
  → fixture generation via the existing ingestion
  → inventory + ledger                         (categories never collapsed)
  → calibration report
```

### Required per script

- original source/document and provenance
- year, paper, task/question
- complete student script (verbatim)
- explicit human-marker overall score
- established score scale (denominator **21** or **100** only)
- evidence that the score is human-marker assigned (official marking record)
- source hash (SHA-256 of the exact source artifact)
- acquisition metadata

### Preferred

- official HKEAA provenance
- marker annotation / scan of the original score
- multiple independent marker scores where available

### Rejected (never accepted)

- inferred score · level-only exemplar · criterion-only score ·
  OCR-only reconstruction · anonymous score · score with unknown
  denominator · score copied from another document ·
  synthetic/generated score · teaching/model essays

## Why the gate is still INSUFFICIENT_DATA

The official HKEAA exemplar booklets publish LEVEL labels only, and the
newly ingested scored-script evidence is 3 samples with 0 comparable
overall scores. A published level ("5**") is never converted into a
numeric score — not now, not in ingestion, not in any report. Sub-marks
(M1/M2) are provenance records only and never enter metric comparison.

## The only accepted evidence shape

`HumanMarkerCalibrationFixture` (`../human-marker.ts` + `../types.ts`).
Every accepted fixture MUST supply:

| Field | Requirement |
|---|---|
| `kind` | exactly `"human-marker-calibration"` |
| `studentScript` | verbatim, non-empty candidate script (no script → invalid, no downgrade) |
| `provenance.sourceOrganization` | organization that supplied the marked script |
| `provenance.sourceDocument` | document the script came from |
| `provenance.sourceYear` | examination year |
| `provenance.paper` | Paper 1–4 |
| `provenance.taskId` | machine-stable task reference |
| `provenance.sectionId` | section/candidate reference |
| `provenance.sourcePageRange` | page range where applicable |
| `provenance.sourceHash` | SHA-256 over the EXACT ORIGINAL SOURCE ARTIFACT bytes (required) |
| `provenance.extractionMethod` | `"native-text"` \| `"ocr"` \| `"manual-transcription"` (required) |
| `provenance.extractionQuality` | `"manual-reviewed"` \| `"ocr-only"` \| `"unknown"` — `"unknown"` makes NO verbatim claim (required) |
| `provenance.sourceAuthorityAssertion` | owner assertion `{assertedBy, authority, acquisitionMethod, verificationRequired}` — provenance metadata ONLY, never a bypass (required) |
| `rubricVersion` | rubric reference the marker applied |
| `markerPolicy` | scoring policy, e.g. "single marking" / "double marking, moderated" |
| `markerId` | marker identity or anonymized marker id (as legally appropriate) |
| `scoreProvenance.suppliedBy` | exactly `"human-marker"` |
| `scoreProvenance.overallScoreDirectlyScored` | `true` whenever `overallScore` is present |
| `scoreProvenance.criterionScoresDirectlyScored` | `true` whenever any criterion score is present |
| `scoreProvenance.overallScoreBasis` | REQUIRED when `overallScore` is present: `"clo-total-0-21"` or `"percentage-0-100"` — without a declared scale a score cannot be compared to model output safely |
| `scoreProvenance.criterionScoreBasis` | REQUIRED when any criterion score is present: `"clo-0-7"` (the only scale comparable to the platform's C/L/O analysis) |
| `scoreProvenance.scoringMethod` | description of how the score was produced |
| `overallScore` | number, ONLY when genuinely supplied by the marker |
| `contentScore` / `languageScore` / `organizationScore` | numbers, ONLY when genuinely supplied by the marker |
| `publishedLevel` | exact published level string ("5**", "5*", "5"…"U") — never converted into scores |
| `publishedSubScores` | verbatim published sub-marks (e.g. M1/M2, "40/42") — provenance only, never compared |
| `calibrationStatus` | `"ingested"` or `"quarantined-needs-manual-verification"` |

## Hard validation rules (fail closed)

- `publishedLevel` cannot generate numeric scores — a fixture whose only
  value is a level is NOT human-marker evidence (it belongs to the HKEAA
  authoritative dataset instead).
- `overallScore` cannot generate criterion scores — any criterion score
  requires `criterionScoresDirectlyScored: true`.
- Criterion scores cannot be inferred from totals.
- Totals cannot be reconstructed from levels.
- Missing provenance, missing source hash, malformed scored evidence,
  missing script text, or a wrong `suppliedBy` ⇒ **invalid, hard failure**.
- Scores without declared scales ⇒ **invalid**: `overallScoreBasis` is
  required whenever `overallScore` is present, and `criterionScoreBasis`
  must be `"clo-0-7"` whenever criterion scores are present. No
  undeclared-scale score is ever compared to model output.
- No silent fallback to `[]`, no silent downgrade from scored → level-only.
- Synthetic fixtures can never become authoritative through
  serialization — the kind and `suppliedBy` must be explicitly present.
- Duplicate evidence (same year+paper+task+section) is reported:
  identical content ⇒ `duplicate` (idempotent); conflicting scores or
  conflicting marker policies ⇒ **hard error, never merged**.

## Step-by-step: how genuine evidence will be accepted later

1. A real candidate script is marked by a human marker under a declared
   policy (marker identity recorded or anonymized as appropriate).
2. The script, task metadata, provenance, and scores are transcribed into
   the shape above — scores are copied, never calculated.
3. Each fixture is validated with `validateHumanMarkerFixture` and the
   whole set with `validateHumanMarkerEvidenceSet` (both fail closed).
4. Deterministic ids are derived with `buildHumanMarkerFixtureId` so
   re-ingestion is stable and duplicates/conflicts are detectable.
5. Only after the set passes validation may it be compared against model
   output — and only then, with enough samples to satisfy the gate policy,
   can the calibration verdict move beyond INSUFFICIENT_DATA.

## What changes when real evidence arrives

- Fixture JSON files will be ingested into this directory (immutability
  rules from `../fixtures/hkeaa/README.md` apply identically).
- The runner path ALREADY exists: `runHumanMarkerCalibrationBenchmark`
  (`../runner.ts`) validates the evidence set, deduplicates identical
  records deterministically, maps scores through the declared scales
  (clo-total → CLO total; percentage → platform score; C/L/O → C/L/O),
  computes MAE/RMSE/bias/exact/±1 agreement (overall, per criterion,
  per level, per year, per task, and per marker policy), and evaluates
  the same policy gates as the authoritative path. It is exercised only
  by clearly-labelled synthetic TEST fixtures until real evidence exists.
- The calibration report will then show agreement metrics computed from
  human-marker scores, clearly separated from HKEAA level-only
  references and from synthetic regression data.

Until real marked scripts exist, the correct state of this directory is
**empty**, and the correct verdict is **INSUFFICIENT AUTHORITATIVE DATA**.
