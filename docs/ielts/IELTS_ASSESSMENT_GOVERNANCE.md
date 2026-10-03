# IELTS Assessment Governance

Date: 2026-10-03. This document preserves the platform's core distinction:

> **AI scoring correctness ≠ assessment validity.**

---

## 1. Assessment sources

Every automated assessment records exactly one source:

| Source | Meaning | When producible |
|---|---|---|
| `AI_ESTIMATE` | AI-assisted feedback and estimated bands | Always (subject to AI availability) |
| `HUMAN_MARKER` | A human marker scored the response | Only when real human marks are ingested |
| `CALIBRATED_HUMAN_VALIDATED` | AI output validated against human-marker evidence | **Impossible today** — blocked in code while `HUMAN_EVIDENCE = INSUFFICIENT` |

`resolveAssessmentSourceGate(calibration)` returns `AI_ESTIMATE` unless real
human evidence exists; `CALIBRATED_HUMAN_VALIDATED` is rejected by a guard and a
contract test. The software can never upgrade its own evidence class.

## 2. Confidence

`HIGH | MEDIUM | LOW | NOT_CALIBRATED`. Implementation policy (verified in code):
- The per-response `confidence` reflects evidence coverage + model self-consistency,
  but it is **capped at MEDIUM** while `HUMAN_EVIDENCE = INSUFFICIENT` — a HIGH
  confidence is unreachable and covered by a contract test.
- The assessment payload separately exposes `calibrationStatus: 'NOT_CALIBRATED'`
  (and the limitations list states `HUMAN_EVIDENCE = INSUFFICIENT`).
- `NOT_CALIBRATED` must not be presented as a quality claim; the UI labels every
  value as an AI estimate.

## 3. Human evidence contract

```
HUMAN_EVIDENCE = INSUFFICIENT | AVAILABLE | SUFFICIENT_FOR_INTERNAL_VALIDATION
MARKER_EQUIVALENCE = UNPROVEN | UNDER_EVALUATION | SUPPORTED
```

Current constants (hard-coded, only changeable with real data + review):
`HUMAN_EVIDENCE = INSUFFICIENT`, `MARKER_EQUIVALENCE = UNPROVEN`.
No code path may compute these states automatically from AI output.

## 4. Calibration architecture (infrastructure only)

```
AI_SCORE → HUMAN_MARKER_SCORE → PAIRING → AGREEMENT ANALYSIS → BIAS/ERROR ANALYSIS → CALIBRATION STATUS
```

- `IeltsCalibrationRecord` stores the pairing (AI band + human band + marker
  reference). **No fake rows are ever created.**
- Agreement metrics (MAE, exact agreement, ±0.5 agreement, Pearson correlation,
  systematic bias, per-criterion breakdown) are only computed from **real**
  paired human marks. With fewer than `MIN_CALIBRATION_PAIRS = 8` paired marks,
  the status is `INSUFFICIENT_DATA` and no accuracy figure is reported.
- The platform never displays "validated accuracy" without human labels.

## 5. Writing assessment architecture

- **Criterion-specific reasoning**, not a single generic "grade this essay" prompt.
  Four criteria evaluated separately; the AI returns per-criterion band, evidence
  (verbatim quotes), strengths, weaknesses, rationale, and uncertainty.
- **Server computes the task band** as the mean of the four criterion bands
  (never the model's self-reported aggregate). Task 2 weighting is applied by the
  scoring layer (`IELTS_SCORING.md` §1).
- **Evidence integrity**: every evidence quote is verified as a substring of the
  submitted text. Hallucinated quotes are stripped and reduce confidence; if the
  assessment lacks verifiable evidence for the majority of criteria, the whole
  assessment fails with `AI_EVIDENCE_MISMATCH` (never silently succeeds).
- **Anti-hallucination instruction set** in every prompt: distinguish
  `OBSERVED | INFERRED | UNKNOWN`; never claim examiner consensus; never invent
  marking rules; never infer a band from word count / advanced-word count /
  complex-sentence count / error count alone (those may be evidence, not the
  criterion). Forbidden phrases ("the examiner would award…") are screened
  post-hoc.
- **Task response validation**: the prompt parses the task into explicit
  requirements (e.g. "discuss both views AND give your opinion" = three checks);
  the model must report per-requirement coverage
  (`ADDRESSED | PARTIALLY_ADDRESSED | NOT_ADDRESSED`) with evidence. Formulaic /
  memorised templates are flagged (`templateSuspicion`) and cannot earn
  Task Response credit that is not evidenced.
- **Word count**: deterministic utility; under-length is surfaced as a limitation,
  never as a silent mechanical penalty claim.

## 6. Speaking — preparation coaching only (no scoring surface exists)

**Decision (2026-10-03, phase II):** the platform does **NOT** assess Speaking
and does **NOT** simulate an examiner. There is no Speaking score, no band, no
language estimate and no pronunciation judgement anywhere in the system — the
previous transcript-based speaking assessment was **retired and deleted**
(service, use case, prompt, route and tests). This is a deliberate scope
decision, not a degradation: simulated examiner dialogue and automated
pronunciation/fluency judgement cannot be produced honestly from the available
technology, so the platform teaches preparation instead of faking assessment.

What the platform provides (all teaching material, platform-original):

- **Topic bank** (`speaking/topic-bank.ts`) — Part 1 themes, Part 2 cue cards
  (People / Places / Objects-Things / Events-Experiences taxonomy), Part 3
  discussion functions, each with preparation pointers, useful language
  functions (adapt, do not memorise) and pitfalls.
- **Methods** (`speaking/strategies.ts`) — the four-quadrant Part 2 note grid,
  story-merging technique (one story, many cue cards), a self-recording
  practice loop, and a self-check list derived from the publicly documented
  criteria (fluency & coherence, lexical resource, grammatical range &
  accuracy, pronunciation as intelligibility).
- **AI preparation coach** (`prepareIeltsSpeaking`) — produces preparation
  plans, facet-by-facet outlines, language functions and follow-up questions.
  The coach is **contractually forbidden** from producing scores, bands,
  examiner impersonations or memorised scripts; any score-language that leaks
  into the output is stripped server-side and recorded as
  `SCORE_LANGUAGE_FILTERED` in `limitations`. The response is typed
  `kind: 'PREPARATION_ONLY'` / `notice: 'NO_SPEAKING_SCORE_OFFERED'`.
- Criterion descriptions are labelled `evidenceType: 'preparable_from_transcript'
  | 'acoustic_required'` — pronunciation is always `acoustic_required`, so no
  text-only pipeline may ever judge it.

Persistence: preparation sessions are stored as `IeltsAssessment` rows with
`skill = SPEAKING`, `estimatedBand = null`, `languageBandEstimate = null` and
the coach output in `prepContent`. Typed failures are stored as
`status: 'FAILED'` rows — preparation failures never read as assessments.

Acoustic evidence separation (future work): `acousticEvidence`,
`transcriptEvidence`, `languageEvidence`, `pronunciationEstimate` remain modelled
as distinct fields so a future speech pipeline could populate them without
changing semantics — and never before it actually exists.

## 7. Failure modes (typed; never converted to success)

```
AI_PROVIDER_TIMEOUT | AI_PROVIDER_ERROR | AI_INVALID_JSON | AI_MISSING_CRITERION
AI_MISSING_EVIDENCE | AI_UNSUPPORTED_BAND | AI_EVIDENCE_MISMATCH | TASK_NOT_ANSWERED
WORD_LIMIT_EXCEEDED
MISSING_SOURCE_EVIDENCE | INVALID_QUESTION | UNVERIFIED_PRONUNCIATION
CALIBRATION_INSUFFICIENT_DATA | GENERATION_EMPTY | WRITING_PROMPT_NOT_CONFORMING
```

Writing-specific enforcement (audit 2026-10-03):

- **Evidence-first is enforced, not requested**: a criterion returned with an
  EMPTY evidence array fails the whole assessment as `AI_MISSING_EVIDENCE` and
  is never persisted as a success (a typed FAILED audit row is stored instead).
  Quotes that fail verbatim verification are stripped from treatment and
  recorded as limitations; majority-hallucination (>50 % of ≥4 quotes) still
  fails as `AI_EVIDENCE_MISMATCH`.

### 7.1 AI question generation (2026-10-03 IV)

AI-authored content (Reading/Listening sets, Writing task prompts) enters ONLY
through `services/generation-service.ts`, which composes three independent
barriers before anything is stored:

1. **Machine screen** — the deterministic `question-validator.ts` runs on the
   generated text (evidence spans recomputed by indexOf; completion answers and
   MC/matching option texts must be verbatim in the passage/transcript; word
   limits; one answer per numbered question; batch/recent dedupe).
2. **Blind-solve verification** — a second model call receives the questions
   WITHOUT answer keys and must independently reach the same answer (scored
   through the real deterministic scorer) with soundness `ok`. A disagreement,
   an `ambiguous`/`flawed` verdict, or an unavailable verifier ⇒ the item is
   DROPPED (fail-closed). Writing prompts pass a conformance checker instead
   (task shape, word minimum, standard scaffolding, no official-copy suspicion).
3. **Lifecycle ceiling** — surviving items persist at `QA_REQUIRED` inside a
   `DRAFT` test with generator version + verification notes. The system path is
   the audited `DRAFT → AI_VALIDATED → QA_REQUIRED`; `HUMAN_APPROVED` and
   `PUBLISHED` remain human-only (reviewer id + timestamp). **AI can NEVER
   publish**, no matter the verdicts.

Honesty obligations: dropped items are reported with reason + count; a set with
no survivors is a typed failure and persists nothing; delivered vs requested
counts (shortfall) are reported as-is. Prompts embed official format rules and
materials-derived blueprints; recent prompts/excerpts are supplied so repeated
generation is de-duplicated. Marketing/quality claims about generated content
remain prohibited (see §11).

### 7.2 Starter content carve-out & the authoring console (2026-10-03 V)

To satisfy "students can practise immediately after login" **without** weakening
the AI gate, exactly one additional path can produce PUBLISHED content:

- **Platform-authored starter content** (`content/starter-sets.ts`) may be
auto-provisioned by `ensureStarterContent()` the first time the catalogue loads
(idempotent; only when the subsystem has zero tests). These sets are
hand-authored and reviewed in the repository (tracked in git), every question
still passes the deterministic machine screen before storage, and rows carry the
provenance stamp `reviewedBy: 'platform-starter-content'`.
- This carve-out is **strictly limited to repo-authored content**. AI-generated
  content remains QA_REQUIRED until a human approves each item; no AI output can
  ever be auto-published.
- **Teacher/admin console** (`/teacher/ielts` + `/api/ielts/admin/*`): trigger
  generation, review items (prompt + canonical key + explanation + status),
  approve → publish per question, then publish the test. Reviewer identity is
always the verified session user; publishing a test requires every question to be
PUBLISHED first.
- **Deployment**: the deploy paths now apply `prisma migrate deploy` BEFORE the
new code runs (Cloud Build Step 1 with the `DIRECT_DATABASE_URL` secret;
`scripts/cloud-run-deploy.ps1` Step 2 locally) — preventing "new code + old
schema" outages. Cloud Build concurrency restored to the documented baseline 50.

### 7.3 AI mistake explanations (2026-10-03 VI) — advisory only

`explainIeltsMistake()` (POST `/api/ielts/mistakes/explain`) explains ONE
objective item the student already answered incorrectly:

- Eligibility is strict: the attempt must belong to the caller and be
  SUBMITTED; the stored response must exist and have verdict `incorrect`; the
  question must be PUBLISHED and belong to the attempt's test. Otherwise the
  request is refused (403/404/409) — the AI is never called.
- **The explanation can never change a mark.** Scoring remains deterministic and
  server-side; the response is labelled advisory
  ("AI-assisted explanation — it never changes your mark") and nothing is
  written back to the attempt.
- The prompt forbids band/score/examiner/guarantee language; output is screened
  sentence-by-sentence (`FORBIDDEN_CLAIM_FILTERED`) and if nothing survives the
  request fails 422 (`AI_OUTPUT_FILTERED`) — nothing fabricated is ever shown.
- Quote discipline: the model must cite the exact words of the
  passage/transcript; content is treated as untrusted data (injection defence).
- Failures are typed (timeout 504 / provider 502 / invalid 422) and budget
  exhaustion maps to 503; the deterministic item explanation already shown in
  the runner always remains available.

- Assessment failures are stored as `status: 'FAILED'` rows with `failureCode`
  and `estimatedBand: null`; they never read as successful assessments.
- `WORD_LIMIT_EXCEEDED` (writing below minimum) is attached as a limitation and
  to the failure-metadata of the assessment; it does not erase a completed
  assessment, but it is never silently dropped either.
- Provider errors surface as structured 503 (budget exhausted) or 502-family
  errors; invalid AI-shaped output surfaces as a failed assessment with retry
  allowed by the client.

### 7.4 Instant self-study practice (2026-10-03 VII) — availability without publication

Students must be able to practise at any time, but AI content must never
auto-publish. `POST /api/ielts/practice/instant`
(`services/instant-practice-service.ts`) resolves the tension:

- **Not a publication.** The set is persisted exactly as authoring persists it
  — DRAFT test + QA_REQUIRED questions — and delivered ONLY to the requesting
  student (`IeltsTest.origin='INSTANT'`, `ownerUserId`). It is never listed in
  the catalogue (`listPublishedTests` filters `origin='CATALOGUE'`), and a
  non-owner can never load, start, submit, synthesise audio for, or get AI
  explanations about it (403/404 on every surface). REJECTED sets are closed
  even to the owner.
- **Same gates as authoring.** Generation runs through the identical machine
  screen + blind-solve verification; nothing persists when nothing survives
  (typed 422 `GENERATION_EMPTY`); shortfall is reported honestly.
- **Honest labelling.** The runner shows an amber banner (“AI instant
  self-study — NOT teacher-reviewed”); advisory explanations add a limitation
  line; the teacher console labels instant sets as unreviewed.
- **Bounded cost.** Per-student cap of 8 sets per Hong Kong day
  (`IELTS_INSTANT_PRACTICE_DAILY_LIMIT`, boundary via `hkStartOfDay`), route
  rate limit 6/min, topic hint capped at 200 chars, and the global AI budget
  gate (503; budget errors propagate untouched).
- **Graduation unchanged.** A teacher reviews the set like any QA_REQUIRED
  content; publishing the test flips `origin` to 'CATALOGUE'.
- **Observability.** Success emits `ielts.instant.delivered` (counts/durations
  only); the daily-cap refusal is a typed 429
  (`INSTANT_DAILY_LIMIT_REACHED`).

## 8. Observability (structured events)

```
ielts.practice.started | ielts.practice.completed | ielts.question.answered
ielts.question.invalid | ielts.writing.assessment.started
ielts.writing.assessment.completed | ielts.writing.assessment.failed
ielts.speaking.prep.started | ielts.speaking.prep.completed
ielts.speaking.prep.failed | ielts.generation.started
ielts.generation.completed | ielts.generation.failed
ielts.ai.provider_error | ielts.ai.timeout
ielts.ai.invalid_output
```

Never logged: passwords, JWTs, API keys, cookies, audio/transcripts beyond the
current request unless existing policy permits. Events carry ids, counts,
durations, codes — not raw private content.

## 9. AI cost & usage telemetry

- Where the provider abstraction exposes provider/model identity, it is stored
  with the assessment (`provider`, `model`).
- Token/cost capture: the platform pipeline does not currently return reliable
  per-call cost to callers, so `usage.costStatus = 'UNKNOWN'` is recorded rather
  than inventing a number. Latency/duration and retry metadata are stored where
  measurable. Do not claim AI cost observability until it is genuinely
  instrumented.

## 10. Prompt versioning

| Prompt name | Version constant | Purpose |
|---|---|---|
| `IeltsWritingAssessment` | `IELTS_WRITING_TASK1_V1` / `IELTS_WRITING_TASK2_V1` | Criterion-specific writing assessment |
| `IeltsSpeakingPrep` | `IELTS_SPEAKING_PREP_V1` | Speaking preparation coaching (no scoring fields exist) |
| `IeltsQuestionGeneration` | `IELTS_QUESTION_GENERATION_V1` / `IELTS_WRITING_PROMPT_GENERATION_V1` | AI authoring of practice content (screened → blind-solved → QA_REQUIRED) |
| `IeltsItemVerification` | `IELTS_ITEM_VERIFICATION_V1` | Independent blind-solve verification (keys never shown) |
| `IeltsMistakeExplanation` | `IELTS_MISTAKE_EXPLANATION_V1` | Advisory mistake explanations (never changes a mark) |

The version used is persisted with every assessment. Scoring prompts are never
changed silently: bump the constant, add a new registry version, keep old
assessments auditable.

**Rubric & task-specification versioning (audit 2026-10-03).** Every persisted
writing evaluation additionally stamps `rubricVersion`
(`IELTS_WRITING_RUBRIC_VERSION = 'ielts-writing-rubric-v1'`, persisted column
on `IeltsAssessment`) and a task-specification version
(`IELTS_TASK_SPECIFICATION_VERSION = 'ielts-task-spec-v1'`, embedded as
`specVersion` in the persisted task-type analysis). A rubric or task-spec change
MUST bump the corresponding constant. Unversioned evaluations = 0
(`__tests__/audit-invariants.test.ts`).

## 11. User-facing wording contract

Allowed: "IELTS-style practice", "estimated band", "AI-assisted feedback",
"practice estimate", "not an official IELTS test".
Forbidden (code + UI): "official IELTS score", "certified IELTS examiner",
"guaranteed band", "official IELTS assessment".
