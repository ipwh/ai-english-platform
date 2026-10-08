# IELTS Subsystem — Compliance Audit (2026-10-03)

Scope: verify that the platform's IELTS practice delivery and marking conform to
official IELTS requirements and formats, and that no user-facing surface can
emit an incorrect claim. Companion documents: `IELTS_SPECIFICATION.md`,
`IELTS_SCORING.md`, `IELTS_ASSESSMENT_GOVERNANCE.md`, `IELTS_SOURCES.md`,
`IELTS_PRACTICE_PATTERNS.md`.

Status vocabulary: `IMPLEMENTED | PARTIALLY_IMPLEMENTED | NOT_AVAILABLE |
NOT_CALIBRATED | NOT_VERIFIED`.

---

## 1. Method

1. Re-fetched the official scoring page (2026-10-03) and re-verified every
   anchor/rounding value transcribed in `domain/conversion.ts` and
   `domain/bands.ts`.
2. Traced every user-facing path end-to-end: delivery projections, scoring,
   feedback payloads, band-estimate display, writing assessment, speaking
   preparation, admin lifecycle, progress views, i18n copy.
3. Ran the full gates after fixes: `tsc` 0 · **3457 pass / 2 skipped (187 files
   passed, 2 skipped)** · eslint 0 errors on changed paths · `check-i18n` exit 0 ·
   `next build` exit 0 · Safari 15.4 baseline `static{` = 0.

## 2. Official requirements re-verified (evidence: live official page)

| Official fact | Platform implementation | Verdict |
|---|---|---|
| 40 questions/component; 1 mark each; whole/half bands only | `objective-scorer` (1 item = 1 mark), `isValidBand` | ✅ MATCH |
| Listening averages: B5=16, B6=23, B7=30, B8=35 | `listening-avg-2026-10` table (exact) | ✅ MATCH |
| Academic Reading: B5=15, B6=23, B7=30, B8=35 | `academic-reading-avg-2026-10` (exact) | ✅ MATCH |
| GT Reading: B4=15, B5=23, B6=30, B7=35 | `general-training-reading-avg-2026-10` (exact) | ✅ MATCH |
| "Precise number of marks varies by test version" | Every conversion is `estimate: true` with range + official note + version + source | ✅ MATCH |
| Overall = average of 4 sections; .25↑ / .75↑ (examples 6.25→6.5, 3.875→4.0, 6.125→6.0) | `roundToHalfBand` / `computeOverallBand`; all three official examples pinned in tests | ✅ MATCH |
| Writing = 4 criteria, equally weighted per task; task score is their average; Task 2 weighted more | criterion assessment + `computeWritingTaskBand` (mean) + `computeWritingSectionBand` (T1+2×T2)/3 | ✅ MATCH |
| Writing minima 150/250; short responses flagged, no mechanical penalty claim | `checkWritingLength` + limitation wording | ✅ MATCH |
| Speaking = 4 criteria equally weighted (real test) | taught as criteria only; **no platform score** | ✅ BY-DESIGN |

## 3. Assessment / review modes — implemented vs not implemented

| # | Mode (評審模式) | What it covers | Status | Evidence / notes |
|---|---|---|---|---|
| 1 | Objective deterministic scoring (客觀題伺服器決定性評分) | Listening/Reading items; client claims ignored; unanswered = 0 | **IMPLEMENTED** | `scoreIeltsItem`, `attempt-service`; `scoredBy='ielts-server-deterministic'` |
| 2 | Reading evidence review (閱讀證據覆核) | Spans must slice-match the passage; completion answers must be locatable | **IMPLEMENTED** | `validateReadingEvidence` (`READING_SPAN_TEXT_MISMATCH`, `READING_ANSWER_NOT_LOCATABLE`) |
| 3 | Listening evidence review (聆聽逐字稿覆核) | Expected answer/accepted variants verbatim in transcript, word-boundary aware | **IMPLEMENTED** | `validateListeningEvidence`; undeliverable audio never synthesised |
| 4 | Machine format screen (題型格式屏檢) | MC options/dupes/banned options; TFNG/YNNG canonical keys; key-count; word-limit consistency; skill↔type match; duplicate prompts | **IMPLEMENTED** | `question-validator.ts` (22+ reject codes) |
| 5 | Human QA lifecycle review (人工發佈評審) | `DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED → PUBLISHED`; reviewer id required; AI can never publish | **IMPLEMENTED** | `admin-service`, `applyTransition`, `assertPublishable` |
| 6 | Writing AI-assisted assessment (寫作 AI 評審) | 4 criteria, criterion-specific, verbatim evidence verification, forbidden-claim filter, server-computed task band | **IMPLEMENTED** (AI_ESTIMATE) | `writing-assessment-service`; hallucination majority ⇒ `AI_EVIDENCE_MISMATCH`; confidence capped MEDIUM |
| 7 | Writing task-type obligation review (寫作題型義務核對) | Deterministic Task 2 question-type / letter-type / visual-type classification → checklist ids `tasktype:*` | **IMPLEMENTED** (2026-10-03 II) | `classifyTask2QuestionType` etc.; obligations injected into prompt + coverage table |
| 8 | Speaking assessment / examiner simulation (口說評分／考官模擬) | Scoring speaking, simulating an examiner, judging pronunciation | **NOT_AVAILABLE (by design)** | Retired & deleted; no code path may produce a Speaking band; `/status` reports `speakingAssessment: NOT_AVAILABLE` |
| 9 | Speaking preparation coaching (口說準備教練) | Plans, outlines, language functions, follow-ups; score language stripped | **IMPLEMENTED** | `prepareIeltsSpeakingWithAI`; `kind:'PREPARATION_ONLY'`; `SCORE_LANGUAGE_FILTERED` |
| 10 | Raw→band conversion review (分數換算範圍估算) | Official anchors as ranges; subset ⇒ `NOT_COMPARABLE_SUBSET`; below lowest anchor ⇒ "Below X" | **IMPLEMENTED** | `conversion.ts`; never an exact band |
| 11 | Writing-section / overall band combination | (T1+2×T2)/3; four-component overall | **PARTIAL — not surfaced** | Functions exist and are tested, but no UI/API claim: Speaking is never scored and a session assesses one task, so the platform deliberately shows per-task estimates only |
| 12 | Human-marker calibration review (人工標記校準) | Paired human marks → marker equivalence | **NOT_AVAILABLE** | `HUMAN_EVIDENCE = INSUFFICIENT`; `CALIBRATED_HUMAN_VALIDATED` impossible (guarded + contract test); calibration report `INSUFFICIENT_DATA` |
| 13 | Listening audio production review (聆聽音訊) | Official recordings | **NOT_AVAILABLE** | Platform TTS only (labelled AI voice, `X-IELTS-Audio-Provenance`); TTS unavailable ⇒ structured 503, never faked |
| 14 | Official score equivalence (官方分數等價) | Claiming equivalence to official results | **NOT_VERIFIED / never claimed** | `officialScoringEquivalence: NOT_VERIFIED`; disclaimers on dashboard + assessments |
| 15 | AI question generation (AI 出題) | LLM generating IELTS practice items | **NOT_IMPLEMENTED (by design)** | Practice content is platform-original (seed/admin), machine-screened, human-published; the AI layer only produces feedback/preparation |
| 16 | Answer-key protection (答案保密) | Keys/evidence never in attempt-time payloads; feedback only after submit | **IMPLEMENTED** | `rowToClientQuestion` projection + route tests |

## 4. Defects found and fixed in this audit

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | 🔴 High | `getSectionTranscriptForDelivery` returned a section's transcript for TTS synthesis **without checking the owning test's publication status** — any authenticated user with a section id could generate audio of a DRAFT test | Gate on `test.status === 'PUBLISHED'` (403 otherwise, 404 if unresolvable); new `catalog-service.test.ts` (published/not-published/missing/resolution-failure) |
| 2 | 🟠 Medium | `listPublishedTests` counted **all** questions of a published test, including later-added DRAFT questions → student-facing counts could overstate what is actually delivered | Filtered relation count (`questions: { where: { validationStatus: 'PUBLISHED' } }`) — count now matches delivery; test pins the mapping |
| 3 | 🟠 Medium | Multi-answer objective items (one item, several keys) were publishable and scored **all-or-nothing**, while official papers number each answer separately ("Choose TWO letters" = two numbered questions, one mark each) — could under-credit learners vs official marking | Validator now **rejects** multi-key MC/matching/completion (`MC_KEY_COUNT` / `MATCHING_KEY_COUNT` / `COMPLETION_KEY_COUNT`) with authoring guidance (use `acceptedAnswers` for variants; author multi-answer instructions as separate numbered questions); scorer keeps a defensive all-or-nothing path for un-migrated rows + explicit comment; `IELTS_SCORING.md` §6 documents the item model; 4 new tests |
| 4 | 🟡 Low | MC validator message referenced a non-existent "answerMode declares multiple" allowance | Message corrected to state the official one-answer-per-number rule |
| 5 | 🟡 Low | Progress list could render `0/0` for submitted attempts with null totals (misleading "score") | Renders `—` unless totals exist |

## 5. Known limitations (documented, not user-visible claims)

- **Number-word compounds**: equivalence covers single number words
  (`fifteen` = `15`); compounds (`twenty-three` ↔ `23`, `two hundred` ↔ `200`)
  are not equated — a deliberate conservative choice (never credits an
  incorrect answer). Authors should list compound forms in `acceptedAnswers`.
- **MC option-count standards** (Listening commonly 3 options, Reading 4) are
  content conventions; the machine screen enforces ≥3 + uniqueness, and QA
  review carries the rest.
- **Seed starter tests** carry no `durationMinutes` (displayed as absent —
  honest, not wrong); official durations live in the writing configs and docs.
- **Combination functions** (`computeWritingEstimate`, `computeOverallBand`)
  are implemented + tested but intentionally not surfaced while Speaking is
  never scored and one session assesses one task.
- **Speaking prep rows** reuse the `IeltsAssessment` table with
  `assessmentSource:'AI_ESTIMATE'` (schema reuse); band fields are `null` and
  the payload is typed `PREPARATION_ONLY`.
- **Legacy rows**: none exist with multi-answer keys (seed + golden fixtures
  are single-key); the defensive scorer path remains for safety.

## 6. Message-surface audit (nothing can misstate)

| Surface | Checked behaviour |
|---|---|
| Pipeline feedback | Verdict/reason computed server-side; correct answer + evidence revealed only after submission |
| Band display | Always a range with the official variance note; subset ⇒ "not comparable"; conversion never exact |
| Writing assessment | Labeled "Estimated task band" (估算); mandatory limitations (`AI-assisted`, `HUMAN_EVIDENCE = INSUFFICIENT`); examiner/guarantee wording filtered |
| Speaking | Page + progress + `/status` all state: no score, no examiner simulation, no pronunciation judgement; coach output screened for score language |
| Listening audio | UI labels AI voice, not official recording; provenance header; fail-closed 503 when TTS unavailable |
| Dashboard | Non-official disclaimer + human-evidence note on entry |
| Progress | "Latest estimate" wording; `—` for unavailable values (no fabricated zeros) |

## 7. Verification after fixes

```
npx tsc --noEmit                     → exit 0
npx vitest run                       → 3457 passed / 2 skipped (187 files passed, 2 skipped)
npx eslint (changed paths)           → 0 errors
node scripts/check-i18n.js           → exit 0
npx next build                       → exit 0 (Safari 15.4 baseline `static{` = 0)
```

## 8. Re-check (same day, second pass — UI surfaces)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 6 | 🟡 Low | Runner showed a **hardcoded English** string `— Max words exceeded` (i18n bypass) | New key `ielts.feedback.wordLimitExceeded` (zh/en); rendered via `t()` |
| 7 | 🟡 Low | Word-limit hint only appeared when an item carried an authored `instruction` string; items with only `maxWords` showed nothing (the `ielts.wordLimitShort` key was defined but unused — students could overrun the limit unwittingly) | Fallback renders `限 N 字內 / Max N words` from `maxWords` when no instruction is authored |
| 8 | 🟢 Info | Per-item feedback delivered `acceptedAnswers` but never displayed them (correct answer + explanation only) | Feedback panel now also lists accepted alternatives (`ielts.acceptedAnswers`) |

Also clarified in `IELTS_SPECIFICATION.md` §5: no LLM question generation
 exists; `AI_VALIDATED` is reached by the **deterministic** machine screen, and
 content enters via seed or human authoring. DeepSeek serves only the writing
 assessment and speaking preparation features.

Re-verified after these fixes: `tsc` 0 · `check-i18n` exit 0 · IELTS suite
169 tests (module) + route tests green · full suite re-run at the end of the
pass.

No production deployment, no git commit/push, no migration executed (unchanged
from the subsystem's standing constraints).

---

## 9. Addendum (2026-10-03 IV) — AI generation implemented, BETA labelling, variant UX

User decisions implemented in this round: (a) AI question generation per
official requirements; (b) mark the whole subsystem **BETA** because no human
calibration exists; (c) distinguish Academic vs General Training so users
choose their own practice mode/type.

**9.1 AI generation (Reading / Listening / Writing).**
- New pipeline: `generate → deterministic machine screen → independent
  blind-solve verification → QA_REQUIRED (DRAFT test) → human approval`.
  Verifier never sees answer keys; a mismatch/ambiguous/flawed verdict or an
  unavailable verifier drops the item (fail-closed); nothing persists when
  nothing survives; shortfall is reported honestly (`POST
  /api/ielts/admin/generate`, teacher/admin only, budget→503).
- **Per-section top-up (2026-10-08 III)**: a section's text is frozen once
  accepted, so a short section is filled by `extendIeltsSectionWithAI` for the
  SAME text (≤3 rounds within a wall-clock budget, same gates, trim recorded as
  `TOPUP_TRIMMED`), never by regenerating the section and never by relaxing a gate.
  Accepted items survive a failed/exhausted round (`TOPUP_ABORTED` ⇒ partial
  delivery + honest shortfall). Measured: reading 33→40/40, listening 23→40/40
  (final run). Also fixed the same day:
  AI question-type vocabulary → canonical names via `resolveIeltsQuestionType()`
  and MC answer keys given as option TEXT → option CODES (both had reduced whole
  components to a `GENERATION_EMPTY` 422).
- Official-format conformance: one answer per numbered question; verbatim
  completion answers; MC/matching checked by option text support (validator fix
  — previously a listening MC letter could never pass the transcript check);
  word limits with official phrasing; reading evidence spans recomputed by
  indexOf; `full_component` scope generates the official 40-question shapes
  (13+13+14 reading, 10×4 listening).
- Writing generation enforces: timing line + word minimum + GT three bullets /
  Task-2 recognised question types + no visual wording beyond the data table +
  a conformance pass before storage.
- Copyright: local study materials (`materials/IELTS/`, incl. Cambridge IELTS
  21) were used for **pattern extraction only** — blueprints, instruction
  phrasings and writing scaffolding in `ai/prompts/ielts/materials-reference.ts`
  are original platform text; no book content is stored/served and the PDFs are
  excluded from the deployment image.

**9.2 BETA labelling.** `IELTS_SUBSYSTEM_STATUS = 'BETA'` (+ reason) in
governance, delivered by `GET /api/ielts/status`, displayed as a badge on the
dashboard / runner / writing / speaking / progress pages and in the nav label
(「IELTS 備考（測試版）」). Disclaimers now state why: no human-marker
calibration, generated content requires human review before publication.

**9.3 Academic vs General Training.** Dashboard shows an explicit variant
explainer (reading texts differ; Writing Task 1 differs — table vs letter;
Listening/Speaking identical). The writing page is now mode-first: choose
Academic/GT → task types filter to that variant → prompt source chooser
(built-in sample / published platform bank via `GET /api/ielts/writing/prompts`
/ custom). Speaking page states the variant note (identical in the official
test). Generation API requires the variant so generated content matches the
chosen mode.

**9.4 New tests (+23).** `generation-service.test.ts` (11): QA_REQUIRED/DRAFT
ceiling (asserts nothing is ever written as PUBLISHED), machine-screen drops,
multi-answer drop, blind-solve mismatch → retry with rejection notes, verifier
unavailable → nothing persisted, listening MC option-text path, invalid count,
budget propagation, writing conformance/retry/variant checks. Plus validator
MC option-text tests (2), governance BETA tests (1), route tests for
`admin/generate` (6) and `writing/prompts` (3).

**9.5 Audit finding fixed en route.** `validateListeningEvidence` applied the
verbatim-transcript rule to ALL listening items — a legitimate listening MC/
matching item (letter answer) could never pass because the letter is not in the
transcript. Code-answer families now verify the **correct option's text**
against the transcript; completion families keep the verbatim rule.

---

## 10. Addendum (2026-10-03 V) — students can practise immediately; deploy path fixed

User requirement: "fix everything so students can use IELTS practice right after
login", without commit/push.

**10.1 Starter content auto-provisioning.** `content/starter-sets.ts` (canonical,
hand-authored, repo-reviewed) + `ensureStarterContent()`: when the IELTS
subsystem has zero tests, the first `GET /api/ielts/tests` provisions the two
starter sets as PUBLISHED (machine-screened before storage; provenance stamp
`reviewedBy: 'platform-starter-content'`; unique-slug/P2002 race-safe;
idempotent — a single COUNT afterwards). This carve-out applies ONLY to
repo-authored content: AI-generated items stay QA_REQUIRED until human approval
(documented in GOVERNANCE §7.2). A provisioning failure is logged and never
breaks the catalogue read.

**10.2 Teacher/admin console.** `/teacher/ielts` (+ nav entry 「IELTS 出題管理」):
trigger DeepSeek generation (skill / variant / scope / count / topic), then
review the queue — prompt, canonical answer, explanation, status — with
per-question 核准 → 發佈 and test-level 發佈. New APIs:
`GET /api/ielts/admin/tests`, `POST /api/ielts/admin/tests/[id]/transition`
(session reviewer identity; forged body ids ignored; test publishing blocked
until every question is PUBLISHED). `GET /api/ielts/admin/questions` now also
returns the canonical answer + explanation for review.

**10.3 Deployment path fixed (the actual deploy blockers).**
- `cloudbuild.yaml`: new Step 1 runs `npx prisma migrate deploy` with the
  `DIRECT_DATABASE_URL` Secret Manager secret BEFORE the image build/deploy
  (fails loudly instead of shipping new code against an old schema);
  concurrency corrected 80 → 50 (documented post-incident baseline).
- `scripts/cloud-run-deploy.ps1`: new Step 2 applies migrations locally before
  build (uses `.env.local` DIRECT_DATABASE_URL; aborts deployment on failure).
- Result after deploy: migration applied → starter content self-provisions on
  first load → students can practise; teachers can generate + publish more.

**10.4 Tests (+13).** `starter-content-service.test.ts` (idempotence gate,
PUBLISHED + provenance stamp, P2002 race tolerance), `starter-content.test.ts`
(all starter questions pass the real machine screen; unique slugs; single-answer
rule), route tests for the catalogue provisioning path (incl. fail-safe read),
admin test list, invalid transition target, and session-reviewer forwarding.

**Verification (V):** `tsc` 0 · **3493 pass / 2 skip (190 files)** · eslint 0
errors (1 pre-existing rule warning) · `check-i18n` exit 0 · `next build` exit 0 ·
Safari baseline `static{` = 0. Still no commit/push and no production deploy.

---

## 11. Addendum (2026-10-03 VI) — AI mistake explanations (score-neutral)

New advisory feature: after submission, an **incorrect** objective item offers
「AI 解說此題」(`POST /api/ielts/mistakes/explain`): why the key is right (with a
verbatim quote from the passage/transcript), why the student's answer fails, and
a tip. Governance guarantees:

- **Scores are untouchable.** Eligibility: attempt owner + SUBMITTED + stored
  `verdict === 'incorrect'` + PUBLISHED question in the same test; otherwise
  403/404/409 and the AI is never called. Nothing is written back; the response
  is labelled "AI-assisted explanation — it never changes your mark".
- **Screening.** Sentence-level removal of band/score/examiner/guarantee wording
  (`FORBIDDEN_CLAIM_FILTERED`); if everything is filtered the route fails 422
  (`AI_OUTPUT_FILTERED`) — no fabricated content is ever displayed.
- **Typed failures.** timeout 504 · provider 502 · invalid 422 · budget 503;
  the deterministic item explanation already shown keeps working regardless.
- **Injection defence.** Passage/question/options/student answer are passed as
  untrusted data; the prompt forbids following instructions inside them.

Verification: `tsc` 0 · **3507 pass / 2 skip (191 files)** · eslint 0 errors ·
`check-i18n` exit 0 · `next build` exit 0 · Safari baseline `static{` = 0.
No commit/push, no production deploy.

---

## 12. Addendum (2026-10-03 VII) — Instant self-study (availability without publication)

New: `POST /api/ielts/practice/instant` lets a student generate practice on
demand. It deliberately does NOT relax “AI never auto-publishes” — it removes
the availability bottleneck without touching the publication invariant:

- **Owner-only delivery.** `IeltsTest.origin='INSTANT'` + `ownerUserId`; every
  surface (test load, attempt start, submit/scoring, listening audio, AI
  explanation) re-checks ownership; non-owners always fail (403/404), REJECTED
  sets are closed even to the owner, and ids shared between students leak
  nothing.
- **Never listed.** The catalogue query filters `origin='CATALOGUE'`, so an
  instant set can never appear as catalogue content; the starter-content
  provisioning count is also catalogue-only, so student activity can never
  block first-login availability.
- **Same automated gates.** Machine screen + independent blind-solve run
  unchanged; persistence remains DRAFT + QA_REQUIRED (the AI/publish contract
  tests still pass).
- **Honest labels.** Amber “NOT teacher-reviewed” banner in the runner, teacher
  console badge, advisory-explanation limitation line.
- **Bounded cost.** 8 sets/student/HKT-day (`hkStartOfDay` boundary), route
  rate limit 6/min, budget → 503 with the error propagated untouched.
- **Graduation.** Publishing a reviewed instant set flips it to the catalogue
  through the normal human path.

Verification: `tsc` 0 · **3537 pass / 2 skip (192 files)** · eslint 0 errors ·
`check-i18n` exit 0 · `next build` exit 0 · Safari baseline `static{` = 0;
new migration `20261003_ielts_instant_practice` (origin/ownerUserId columns +
index). No commit/push, no production deploy.
