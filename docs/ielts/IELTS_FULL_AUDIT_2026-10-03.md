# IELTS Subsystem — Full Engineering Audit (2026-10-03)

**Scope.** An engineering + assessment-engineering + IELTS test-design QA audit
of the entire IELTS subsystem (`src/modules/ielts/`, `/api/ielts/*`,
`/student/ielts/*`, `/teacher/ielts`, AI support modules), performed on the
complete uncommitted 2026-10-03 work stream.

**Method.** (1) Repository state inspection; (2) live re-fetch of official
IELTS sources; (3) audit of the existing implementation against the official
specification, the platform assessment architecture, and evidence semantics;
(4) targeted fixes for real gaps; (5) executable audit invariants added as
tests; (6) full verification rerun.

**Constraints respected.** No deploy, no commit/push, no production migration
execution, no production credentials/data touched. All migrations are
source-only: `PENDING_DEPLOYMENT_AUTHORIZATION`.

---

## 0. Executive summary

The audit found **two real gaps**, both in writing-assessment integrity, both
now fixed fail-closed:

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | A writing criterion returned with an **empty evidence array** was accepted (only confidence dropped) → an evidence-less band could be persisted as success | **Defect** | New typed failure `AI_MISSING_EVIDENCE`: the whole assessment is refused and only a FAILED audit row is stored |
| 2 | Evaluations were not **rubric/spec version-stamped** (`rubricVersion` absent from persistence; task-spec only implicit) | **Gap** | `IELTS_WRITING_RUBRIC_VERSION` + `IELTS_TASK_SPECIFICATION_VERSION`; `rubricVersion` column (source-only migration) + `specVersion` in the persisted task-type analysis |

Everything else audited **clean**: isolation (both directions) = 0 matches,
prohibited provenance labels = 0, all 5 IELTS prompts versioned, objective
scoring deterministic, speaking offers no scoring surface, publication
requires a human reviewer everywhere.

**Verification after fixes:** `tsc` 0 · **3547 passed / 2 skipped (193 files)**
· eslint 0 errors · `check-i18n` exit 0 · `next build` exit 0 · Safari-15.4
baseline `static{` = 0.

**Final status: `IMPLEMENTATION_COMPLETE_WITH_KNOWN_LIMITATIONS`** (no
calibration evidence exists; validity is not established and is never claimed).

---

## A. Implementation summary (audit-phase delta)

**Added:**
- `prisma/migrations/20261003_ielts_assessment_rubric_version/migration.sql`
  (`ALTER TABLE "IeltsAssessment" ADD COLUMN "rubricVersion" TEXT;`) — **not executed**
- `src/modules/ielts/__tests__/audit-invariants.test.ts` — executable audit invariants
- `docs/ielts/IELTS_FULL_AUDIT_2026-10-03.md` (this report)

**Changed (audit phase):**
- `domain/types.ts` — `AI_MISSING_EVIDENCE` in `IeltsFailureCode`
- `governance/events.ts` — failure-event mapping for the new code
- `writing/criteria.ts` — rubric + task-spec version constants
- `services/writing-assessment-service.ts` — evidence-less gate; version stamping (result, success persist, failure persist); `specVersion` in task-type analysis
- `prisma/schema.prisma` — `IeltsAssessment.rubricVersion`
- `app/api/ielts/writing/assess/route.ts` — failure-comment updated (422 default covers the code)
- `shared/utils/i18n-ielts.ts` — `ielts.error.AI_MISSING_EVIDENCE` (zh/en)
- `modules/ielts/index.ts` — exports the two version constants
- Tests: `writing-assessment-service.test.ts` (+1 gate test, +version assertions), `word-count.test.ts` (+boundary test)
- Docs: `IELTS_ASSESSMENT_GOVERNANCE.md` (§7 failure list + evidence-first rule; §10 full prompt table + versioning), `IELTS_SOURCES.md` (live re-verification note), `CHANGELOG.md` (VIII), `AGENTS.md`/`CLAUDE.md` (counts), `CODE_REVIEW_2026-10-03.md` (addendum)

**Pre-existing this day (context):** Phases I–VII — full subsystem, 19 routes,
6 pages, 5 AI prompts (#14–#18), starter content, instant self-study. See
`CODE_REVIEW_2026-10-03.md` for the file inventory.

---

## B. IELTS compliance matrix

| # | Official requirement | Official source | Implementation | Test | Status |
|---|---|---|---|---|---|
| 1 | Four components; Listening & Speaking shared; Reading/Writing differ by variant | SOURCES #2–#7; acad. test page (fetched) | `domain/types`, per-variant task configs, catalogue variant filters | `conversion.test.ts` ("listening table is shared; reading tables differ"), `bands.test.ts` | ✅ |
| 2 | Listening: 4 parts × 10 Q; official question types only | SOURCES #6 | `LISTENING_ALLOWED_TYPES`; `full_component` = 10×4 | `generation-service.test.ts`, `validation.test.ts` | ✅ |
| 3 | Academic Reading: 3 sections / 40 Q, 11 question types | SOURCES #2 | `READING_ALLOWED_TYPES`; full = 13+13+14 | `generation-service.test.ts`, `validation.test.ts` | ✅ |
| 4 | GT Reading: separate anchors, own genre expectations | SOURCES #3 | GT conversion table; GT starter set; type gating | `conversion.test.ts` ("GT Reading has its own anchor set") | ✅ |
| 5 | TFNG / YNNG: support / contradiction / absence distinctions; no keyword-only matching | SOURCES #2 | token-set normalization; NOT_GIVEN ≠ FALSE; validator + scorer | `objective-scorer.test.ts`, `validation.test.ts` | ✅ |
| 6 | Reading answers must be supported by a passage span | SOURCES #2 | evidence spans slice-match passage (recomputed by indexOf); missing/unsupported ⇒ reject | `validation.test.ts` (span mismatch, not-locatable) | ✅ |
| 7 | Writing: 2 tasks, ≥150/≥250 words, ~20/40 min; Task 2 counts **twice** | SOURCES #4/#5 (re-fetched; quoted in SOURCES) | `IELTS_WRITING_TASKS` (minWords/weight/minutes); `computeWritingTaskBand` 2× weighting | `bands.test.ts` ("Task 2 double weight"), `word-count.test.ts` | ✅ |
| 8 | Exactly four criteria: Task Achievement/Response, Coherence & Cohesion, Lexical Resource, Grammar Range & Accuracy | SOURCES #4/#9/#12 (re-fetched; criteria list confirmed) | `IELTS_WRITING_CRITERIA_DEFINITIONS`; schema fields; prompt | `writing-assessment-service.test.ts` | ✅ |
| 9 | Below-minimum ⇒ "may not provide enough evidence … higher bands" — no invented mechanical penalty | SOURCES #4 (re-fetched) | `checkWritingLength.officialNote` mirrors official wording; surfaced as limitation | `word-count.test.ts` (+149/150/249/250 boundaries), writing tests | ✅ |
| 10 | Overall writing band derived from criteria (Task 2 double) | SOURCES #8/#9 | server-side deterministic aggregation; LLM's aggregate never trusted | `bands.test.ts`, writing happy-path | ✅ |
| 11 | Speaking: Part 1 / 2 / 3 interaction structure | SOURCES #7 | `IELTS_SPEAKING_PARTS` + topic bank + 4-quadrant prep methods | `topic-bank.test.ts`, speaking tests | ✅ |
| 12 | Pronunciation cannot be scored from transcript | SOURCES #7/#10 | **stricter than required**: no speaking scoring surface at all; criteria marked `acoustic_required`; pronunciation `NOT_VERIFIED` | `speaking-prep-service.test.ts` (no-score contract), `audit-invariants.test.ts` | ✅ |
| 13 | Band scale 1–9 whole/half; .25↑/.75↑ rounding | SOURCES #8 | `roundToHalfBand` with official examples; ranges only vs anchors | `bands.test.ts`, `conversion.test.ts` | ✅ |
| 14 | No official/copyrighted content copied | usage rules; materials pattern-only | all content original; fixtures labelled INTERNAL; PDFs excluded from image | `golden-fixtures.test.ts` ("labelled as internal, non-official"), `.dockerignore` | ✅ |

---

## C. Isolation matrix

| Rule | Evidence | Status |
|---|---|---|
| IELTS runtime → HKDSE module imports = 0 | source scan (`audit-invariants.test.ts` + manual scan: only doc-comments mention HKDSE; "prepared**Set**" regex false positives distinguished) | ✅ 0 |
| HKDSE modules → IELTS imports = 0 (no reverse dependency) | source scan over 9 HKDSE module dirs | ✅ 0 |
| No HKDSE scoring semantics / calibration / ADR / prompts / fixtures touched | modified-file list contains only IELTS-scoped code, AI-facade exports, i18n, docs, deploy configs | ✅ |
| No IELTS writes to HKDSE score/evidence/XP tables | `ielts-repo.ts` touches only `Ielts*` models; attempt service comment + design; isolation scan | ✅ |
| Shared surface limited to infra (auth, rate-limiter, logger, hk-date, AI facade) | import scan of IELTS runtime files | ✅ |
| Prohibited provenance labels (`OFFICIAL_IELTS_SCORE`, `CERTIFIED_IELTS_SCORE`, `HUMAN_EXAMINER_SCORE`, `CALIBRATED_IELTS_SCORE`) = 0 | source scan | ✅ 0 |

---

## D. Scoring integrity matrix

| Area | Deterministic? | Evidence | Status |
|---|---|---|---|
| Reading/Listening objective scoring | ✅ pure function, no AI | `scoreIeltsItem`; repeat + variant-order invariance test | ✅ |
| Client correctness claims | Never trusted | `attempt-service.test.ts` ("client correctness claims are not part of the contract") | ✅ |
| One numbered question = one answer | Enforced | validator rejects multi-answer; scorer multi-answer all-required only where officially required | ✅ |
| Word limits ("lose the mark") | Enforced | over-limit ⇒ incorrect; hyphenated = 1 word; numbers figures↔words allowed only when permitted | ✅ |
| Spelling | No silent expansion | variants only via authored `acceptedAnswers` | ✅ |
| Partial credit | None invented | official has none; exact (deterministic) or overlap (AI-scored short answers) only | ✅ |
| Writing overall band | Server-computed | criterion bands → deterministic aggregation (2× Task 2); model aggregate ignored | ✅ |
| Evidence-less scores | **Rejected (new)** | `AI_MISSING_EVIDENCE` gate | ✅ 0 |
| Unverified quotes | Stripped + recorded; majority-hallucination fails | `EVIDENCE_QUOTE_NOT_VERIFIED`, `AI_EVIDENCE_MISMATCH` | ✅ |
| Band validity | Whole/half, 1–9 only | `7.13` ⇒ `AI_UNSUPPORTED_BAND` | ✅ |

---

## E. AI provenance matrix

| Output | Provenance | Human calibration? | Status |
|---|---|---|---|
| Generated questions (Reading/Listening/Writing prompts) | AI-generated → machine screen + blind-solve → `QA_REQUIRED` (DRAFT); publication requires human reviewer id | None — never claimed | ✅ |
| Instant self-study sets | `origin='INSTANT'`; owner-only; labelled "NOT teacher-reviewed"; never listed; graduation via human publish | None | ✅ |
| Listening/Reading band estimates | `estimate: true`; official-anchor RANGES; subset ⇒ NOT_COMPARABLE; no official-score claim | None | ✅ |
| Writing criterion scores + overall | `AI_ESTIMATE` + `NOT_CALIBRATED`; verbatim evidence per criterion; confidence capped below HIGH; rubricVersion + specVersion stamped | None | ✅ |
| Speaking | `PREPARATION_ONLY`, `NO_SPEAKING_SCORE_OFFERED`; schema has no score fields; leaked score language stripped | n/a (no scores exist) | ✅ |
| Mistake explanations | Advisory only; never changes the mark; forbidden-claim screening | None | ✅ |
| Forbidden labels | 0 occurrences (scan) | — | ✅ |

---

## F. Test results (actual, this audit)

| Command | Result |
|---|---|
| `npx vitest run` | **3547 passed / 2 skipped (193 files passed, 2 skipped)** |
| IELTS-focused run | 20 files / **259 tests passed** (was 249) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint <IELTS + touched paths>` | 0 errors (3 pre-existing `react-hooks/set-state-in-effect` warnings, repo-downgraded) |
| `node scripts/check-i18n.js` | exit 0 |
| `npx next build` | exit 0 |
| Safari-15.4 baseline `static{` grep | 0 matches |
| Isolation scans (both directions) | 0 matches |
| Prohibited provenance labels | 0 matches |
| IELTS prompt registry entries | 5 / 5 versioned |

---

## G. Remaining limitations (explicitly frozen)

```
HUMAN_EVIDENCE      = INSUFFICIENT
MARKER_EQUIVALENCE  = UNPROVEN
IELTS_VALIDITY      = NOT_ESTABLISHED
CALIBRATION_STATUS  = INSUFFICIENT_DATA   (0 verified paired human marks)
AI_COST             = UNKNOWN
SUBSYSTEM STATUS    = BETA
```

Also intentionally out of scope (documented, not defects): no acoustic
pronunciation analysis; no examiner simulation; no partial credit; instant-set
QA-queue volume (bounded by per-student daily caps); migrations pending
deployment authorization.

**Semantic distinctions preserved:** NOT_VERIFIED ≠ PASS · WAIVED ≠ VERIFIED ·
AI_ESTIMATE ≠ HUMAN_MARKER_SCORE ≠ OFFICIAL IELTS SCORE · TRANSCRIPT ≠
PRONUNCIATION EVIDENCE · FORMAT_MATCH ≠ VALIDATED_ASSESSMENT ·
SOFTWARE_TEST_PASS ≠ IELTS_SCORE_VALIDITY.

---

## H. Required final verification — zero counts

| Required zero | Observed | Evidence |
|---|---|---|
| IELTS_HKDSE_IMPORT_MATCHES | **0** | audit-invariants test + manual scan |
| HKDSE_TEST_FAILURES | **0** | full suite green |
| IELTS_SCHEMA_FAILURES | **0** | schema/service tests (missing criterion/evidence, invalid band) |
| IELTS_GENERATION_GATE_FAILURES | **0** | generation tests (fail-closed, QA_REQUIRED ceiling) |
| OBJECTIVE_SCORING_NONDETERMINISM | **0** | determinism test |
| WRITING_MISSING_CRITERIA | **0** | `AI_MISSING_CRITERION` test |
| WRITING_EVIDENCELESS_SCORES | **0** | `AI_MISSING_EVIDENCE` gate (new) + test |
| SPEAKING_FALSE_PRONUNCIATION_SCORES | **0** | no scoring surface; `NOT_VERIFIED` pin |
| UNVERSIONED_IELTS_PROMPTS | **0** | registry scan (5/5 versioned) |
| UNVERSIONED_IELTS_RUBRICS | **0** | rubric/spec constants + stamping test |

---

## I. Conclusion

**Is the IELTS subsystem engineering-correct** with respect to IELTS format,
question validity, objective scoring, rubric-based writing evaluation, speaking
limitations, provenance, and HKDSE isolation? **Yes — within these boundaries:**
every requirement above is implemented, test-pinned, and verified; the two
audit findings were fixed fail-closed; and nothing in this system claims
official-score validity, examiner equivalence, or calibration that does not
exist.

```
FINAL STATUS: IMPLEMENTATION_COMPLETE_WITH_KNOWN_LIMITATIONS
```

---

## Part 2 — Master-prompt compliance pass (2026-10-03, same day)

A second, broader master implementation prompt (platform-wide IELTS directive)
was mapped against this subsystem. All of its requirements were already
implemented and audit-verified except three, now added:

1. **TARGET_BAND difficulty labels** (`domain/difficulty.ts`) — a documented
   *platform authoring heuristic* (4–5.5 ⇒ EASY, 6–7 ⇒ MEDIUM, 7.5–9 ⇒ HARD),
   **not** an official taxonomy and **not** a CEFR-equivalence claim; accepted by
   the generation service + admin generate route (unknown label ⇒ 400).
2. **`scoringMethod` on objective band estimates** — every `IeltsBandEstimate`
   carries `scoringMethod: 'DETERMINISTIC_OBJECTIVE'` (writing keeps
   `assessmentSource: 'AI_ESTIMATE'`; the concepts are never conflated).
3. **Executable cache + prompt-injection scans** — no IELTS route may add public
   cache directives (audio stays `private, max-age`); the three prompts touching
   student content must carry anti-injection fencing text (scan-pinned).

### Master-prompt final report (§47 format, condensed)

- **Executive verdict: READY_WITH_LIMITATIONS.**
- **Feature matrix:** Academic ✅ · General Training ✅ · Listening ✅ ·
  Reading ✅ · Writing ✅ · Speaking ✅ (preparation-only, no scoring) — all
  TESTED (unit + integration + route-security).
- **Official-source compliance:** Part 1 §B (14 rows; sources re-verified live).
- **Scoring:** objective deterministic (`DETERMINISTIC_OBJECTIVE`, `estimate:
  true` ranges, `scoringMethod` stamped) · writing AI estimate (criterion +
  verbatim evidence + server-side aggregation + rubric/spec versions) ·
  speaking non-scoring · overall-band rounding tested · evidence-less scores
  rejected (`AI_MISSING_EVIDENCE`).
- **Safety:** generation gate (schema → machine screen → blind-solve →
  QA_REQUIRED) · answerability validator · AI failures typed (never PASS /
  BAND_0) · prompt injection fenced + scan-pinned · authorization (19 routes,
  role + ownership, source-tested) · student isolation: route-level functional
  emulation **TESTED**; genuine two-user production integration **NOT_TESTED**
  (no authorized test identities) · cache safety scan **TESTED**.
- **HKDSE isolation evidence:** IELTS→HKDSE = 0 · HKDSE→IELTS = 0 (executable,
  Part 1 §C).
- **Verification (after this pass):** `tsc` 0 · **3553 passed / 2 skipped
  (193 files)** · eslint 0 errors · `check-i18n` 0 · `next build` 0 · Safari
  baseline `static{` = 0.
- **Known limitations (unchanged):** `HUMAN_EVIDENCE = INSUFFICIENT` ·
  `MARKER_EQUIVALENCE = UNPROVEN` · `IELTS_VALIDITY = NOT_ESTABLISHED` ·
  `AI_COST = UNKNOWN` · subsystem = BETA · no timed mock-test mode is claimed
  (full-component sets are generation scope) · timers are domain metadata only
  (no UI countdown) · speaking transcription NOT_AVAILABLE.
- **Deployment boundary:** **NOT DEPLOYED · NOT COMMITTED · NOT PUSHED**;
  migrations are source-only, `PENDING_DEPLOYMENT_AUTHORIZATION`.

---

## Part 3 — Hardening pass (third master prompt, 2026-10-03)

**Research (live re-fetch of Listening / Speaking / Scoring-in-detail pages):**
all previously recorded facts re-confirmed; conversion tables and rounding tests
needed no change. Two additional official rules became enforceable and were
added, plus two integrity hardenings:

1. `ANSWER_LEAKED_IN_PROMPT` — word-limited prompts already containing the
   answer verbatim are rejected (no copy-from-the-question items).
2. `LISTENING_CONTRACTION_KEY` — contracted-word keys rejected (official:
   contracted words are not tested); names/possessives unaffected.
3. `computeOverallBand` — exactly FOUR component bands required; partial sets
   throw (official overall = average of the four sections).
4. `IELTS_TARGET_BAND_BASIS = 'AUTHOR_HEURISTIC'` — grep-able basis record.

### Final report (§39 format)

1. **Executive verdict: READY_WITH_CALIBRATION_REQUIRED** — implementation is
   ready; score-validity claims remain gated on human-marker calibration that
   does not exist.
2. **Official-source audit:** Part 1 §B (14 rows); SOURCES.md carries two live
   re-verification notes (Writing/Academic pages + Listening/Speaking/Scoring).
3. **Architecture changes:** `domain/bands.ts` (strict 4 components),
   `validation/question-validator.ts` (leak + contraction guards),
   `domain/difficulty.ts` (basis constant) + tests. Risk: stricter generation
   rejection rate — fail-closed by design; the top-up loop compensates.
4. **Generation safety:** schema → machine screen (now incl. leak/contraction
   guards) → blind-solve → QA_REQUIRED; injection fencing scan-pinned;
   provenance + versions stamped.
5. **Scoring audit:** Listening/Reading deterministic (`DETERMINISTIC_OBJECTIVE`
   + `estimate: true` ranges) · Writing AI estimate (evidence-first, server
   aggregation, rubric/spec versions) · Speaking non-scored · Overall band
   strict-four + full rounding matrix (TESTED).
6. **Security audit:** auth/role/ownership on all 19 routes (route tests) ·
   student isolation: functional emulation TESTED, dual-account production
   integration NOT_TESTED · cache scan TESTED · prompt injection fenced +
   scan-pinned.
7. **HKDSE isolation:** IELTS→HKDSE = 0 · HKDSE→IELTS = 0 (executable).
8. **Test evidence:** `tsc` 0 · **3559 passed / 2 skipped (193 files)** ·
   eslint 0 errors · `check-i18n` 0 · `next build` 0 · Safari baseline 0.
9. **Known limitations (unchanged):** `HUMAN_EVIDENCE = INSUFFICIENT` ·
   `MARKER_EQUIVALENCE = UNPROVEN` · `IELTS_VALIDITY = NOT_ESTABLISHED` ·
   `AI_COST = UNKNOWN` · BETA · no timed mock mode · timers metadata-only ·
   speaking transcription NOT_AVAILABLE.
10. **Deployment boundary:** NOT DEPLOYED · NOT COMMITTED · NOT PUSHED.
