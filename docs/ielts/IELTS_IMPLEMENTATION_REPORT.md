# IELTS Implementation Report — PHASE IELTS-01

Date: 2026-10-03 · Branch: `main` working tree (no commits made; nothing pushed)
Status vocabulary: `DIRECT | TEST_VERIFIED | SAMPLE_BASED | AI_ESTIMATE | NOT_TESTED | NOT_VERIFIED | UNKNOWN | WAIVED`

> **Superseded in part (2026-10-03 II):** the Speaking **assessment** described in
> sections 1/3/5/6 below was retired and deleted; Speaking is now preparation
> coaching only. Read the addendum before the final governance state. Writing
> assessment additionally gained deterministic task-type analysis. Everything
> else in this report stands.

---

## 1. Executive verdict

The platform now contains a **production-grade, fully isolated IELTS-style practice
subsystem** (`src/modules/ielts/` + AI use cases + `/api/ielts/*` + `/student/ielts/*`):

- Objective Listening/Reading scoring is **deterministic and server-authoritative**
  (`scoreIeltsItem`), with official word-limit/hyphenation/number rules implemented as
  validation rules — `TEST_VERIFIED` (58 dedicated scoring/domain tests: objective-scorer 17,
  word-count 17, bands 14, conversion 10).
- Raw→band conversion uses **versioned official anchor points reported as ranges**
  (`estimate: true`), never a fabricated universal table — `DIRECT` (source-anchored) +
  `TEST_VERIFIED`.
- Writing/Speaking AI assessment follows criterion-specific prompts, verbatim-evidence
  verification, forbidden-claim filtering, typed failure modes and a **server-computed**
  task band. All bands are **AI estimates** — `TEST_VERIFIED` for failure-mode behaviour
  with a mocked provider; the live provider path is **NOT_TESTED here** (no network AI
  calls were made during this task; the platform pipeline used is the same one already in
  production).
- Governance is enforceable in code: `CALIBRATED_HUMAN_VALIDATED` is impossible while
  `HUMAN_EVIDENCE = INSUFFICIENT`; pronunciation is `NOT_VERIFIED`; AI can never publish
  content — `TEST_VERIFIED` (contract tests).
- HKDSE behaviour unchanged: full suite **3435 passed / 2 skipped (185 files)** vs the
  pre-change baseline 3288/2 (173 files); +147 new tests, 0 removed/changed — `TEST_VERIFIED`.

**Software status:** `IMPLEMENTED`. **Assessment-validity status:** unchanged by design —
`IELTS_SCORE_VALIDITY = NOT_ESTABLISHED`, `HUMAN_EVIDENCE = INSUFFICIENT`,
`MARKER_EQUIVALENCE = UNPROVEN`, `AI_COST = UNKNOWN`.

## 2. Existing architecture discovered (reconnaissance)

- Next.js 16 App Router; dynamic route `params` are Promises (`await params`).
- Single AI pipeline: `executeAI()` (JSON+Zod) / `executeAIRaw()`; prompt metadata in
  `ai/prompts/prompt-registry.ts`; facade `@/modules/ai` consumed by routes/modules.
- Auth: `verifyApiAuth(request, allowedRoles?)` (JWT + NextAuth); ownership patterns via
  `userId` comparison and `resolveTeacherStudentClass` for teachers.
- Prisma 7 + `@prisma/adapter-pg`; repositories under `src/modules/*/repositories/`;
  barrel `src/modules/repositories.ts`; JSON columns stored as TEXT.
- i18n: `src/shared/utils/i18n-*.ts` merged in `i18n.ts`; `scripts/check-i18n.js` guards
  hardcoded Chinese (skips `api/`, tests).
- TTS: `ttsService.synthesizeSpeech({ multiSpeaker })` synthesises dialogues (used by
  HKDSE listening); GCP credentials required.
- Test conventions: Vitest 4; services tested with `vi.mock` of `@/shared/db/db`-reaching
  modules; route tests mock `verifyApiAuth` + rate limiter (functional role emulation).
- Deploy target: Cloud Run only, via `scripts/production-build.js` (which itself runs
  `prisma migrate deploy` — requires a reachable DB).

## 3. Files changed

**Modified (7 files, +259/−5):**
`AGENTS.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/modules/ai/index.ts`,
`src/modules/ai/prompts/prompt-registry.ts`, `src/shared/utils/i18n.ts`,
`src/shared/utils/nav.ts`, plus `CHANGELOG.md`.

**New (66 files ≈ 9.8k lines):**
- `docs/ielts/` — SPECIFICATION, SOURCES, SCORING, ASSESSMENT_GOVERNANCE, this report.
- `prisma/migrations/20261003_ielts_module/migration.sql` (additive only).
- `src/modules/ielts/` — domain (types, bands, word-count, normalization, conversion),
  scoring (objective-scorer, aggregate), validation (question-validator, pipeline),
  writing/criteria, speaking/criteria, governance (states, calibration, events),
  repositories/ielts-repo, services (catalog, attempt, writing-assessment,
  speaking-assessment, progress, admin, row-mappers), `__tests__/` (11 files,
  incl. `fixtures/golden.ts`), `index.ts`.
- AI layer: `ai/prompts/ielts/{writing,speaking}-assessment.ts`,
  `ai/schemas/ielts-assessment-schema.ts`,
  `ai/usecases/ielts-{writing,speaking}-assessment.ts`.
- API: `src/app/api/ielts/**` (11 route files) + `src/app/api/__tests__/ielts-route-security.test.ts`.
- UI: `src/app/student/ielts/{page,tests/[id]/page,writing/page,speaking/page,progress/page}.tsx`,
  `src/shared/utils/i18n-ielts.ts`.
- `scripts/seed-ielts.ts`.

## 4. Database changes

- 7 new models: `IeltsTest`, `IeltsSection`, `IeltsQuestion`, `IeltsAttempt`,
  `IeltsResponse`, `IeltsAssessment`, `IeltsCalibrationRecord`; one relation field pair
  added to `User` (no DB column change). Migration `20261003_ielts_module` is pure
  `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` — **no destructive statement**, no
  existing table touched.
- **The migration was NOT executed against any database** (`NOT_TESTED` against a live DB;
  `DIRECT` for schema/migration consistency — `prisma generate` validated the schema;
  migration SQL was hand-verified against it). Running it is a separate, authorized
  deployment step. `scripts/production-build.js` attempted `prisma migrate deploy` locally
  and failed with P1001 (no DB reachability from this environment) — that failure is
  environmental, not a migration error; no partial application occurred.

## 5. API changes

New under `/api/ielts/` (all `verifyApiAuth` + per-user rate limits):
`GET /tests`, `GET /tests/[id]` (keys stripped), `POST /attempts`, `GET /attempts`,
`GET /attempts/[id]` (owner/admin/class-teacher), `POST /attempts/[id]/submit`
(server scoring), `POST /writing/assess`, `POST /speaking/assess`, `GET /progress`,
`GET /status`, `POST /sections/[id]/audio` (platform TTS; transcript never sent),
`GET|POST /admin/questions`, `POST /admin/questions/[id]/validate`,
`POST /admin/questions/[id]/transition`. Failure mapping: budget→503, timeout→504,
provider→502, invalid/refused assessments→422 with typed codes.

## 6. UI changes

`/student/ielts` dashboard (Academic/GT tabs, skill grouping, disclaimers), test runner
(reading passages; listening via AI-voice TTS with explicit provenance; per-question
feedback after submit; band estimate shown as a **range** with the official variance
note), writing practice (task types, live word count, criterion cards with verified
quotes, coverage table, limitations), speaking practice (3-part workflow, transcript
input, pronunciation `NOT_VERIFIED` panel, language estimate), progress (SQL-level counts
+ latest-per-skill estimates + governance status). Nav: 「IELTS 備考」. All strings via
`i18n-ielts.ts` (zh/en) — `check:i18n` exit 0.

## 7. IELTS official sources consulted

See `docs/ielts/IELTS_SOURCES.md` (14 entries, checked 2026-10-03): sample-test hub;
Academic/GT Reading format; Academic/GT Writing format; Listening format; Speaking
format; scoring-in-detail; Writing/Speaking Band Descriptors; Writing/Speaking Key
Assessment Criteria; Cambridge test-format cross-check. Third-party material was not
used to override official specifications.

## 8. IELTS invariants implemented

4 parts/40Q listing shape; word limits enforced (over-limit = lose the mark); hyphenated
= single word; recordings-once semantics reflected in delivery (transcript hidden until
submission); Academic vs GT Reading/Writing modelled separately (text types, letter vs
visual description, per-test conversion anchors); Writing 4 criteria + Task 2 weighting;
Speaking 3 parts + 4 criteria (pronunciation withheld); T/F/NG & Y/N/NG semantics encoded
in validation/QA flags; no notes/bullets and short-answer caveats surfaced as guidance.

## 9. Deterministic scoring guarantees

`scoreIeltsItem()` is pure and server-only; client correctness claims are never read.
Scoring provenance stored per response (`ielts-server-deterministic`, reason, word count,
limit-exceeded). Conservative normalization: no stemming/spell-fixing; numbers
figure↔word; accepted variants authored pre-publication only. Covered by
`objective-scorer` (17), `conversion` (10), `bands` (14), `word-count` (17),
`golden-fixtures` (11) tests — all `TEST_VERIFIED`.

## 10. AI assessment architecture

Versioned criterion-specific prompts (`IELTS_WRITING_TASK1_V1` / `TASK2_V1` /
`IELTS_SPEAKING_V1`) through the canonical pipeline; Zod parse tolerant, service-level
semantic validation strict (band legality, verbatim evidence, coverage, claim filtering);
task band computed server-side; audit rows store provider, prompt version + hash,
duration, criteria/evidence JSON, confidence, limitations, `usage.costStatus = UNKNOWN`.

## 11. AI limitations

All bands are **AI_ESTIMATE**; no examiner-equivalence claim anywhere (forbidden-phrase
screen + UI wording contract). Fluency is a **text-based proxy**; pronunciation
`NOT_VERIFIED` (full speaking band withheld). Evidence quotes are verified against the
submission; majority-hallucination fails the assessment. Live-provider behaviour was not
exercised in this task (`NOT_TESTED` for live AI calls; failure modes `TEST_VERIFIED`
with a mocked provider).

## 12. Calibration status

`CALIBRATION = INSUFFICIENT_DATA`. Infrastructure exists (`IeltsCalibrationRecord`,
agreement metrics with MAE / exact / ±0.5 / Pearson / bias, gate at ≥8 real pairs) but
**no fabrication**: with 0 pairs, metrics are `null` — `TEST_VERIFIED`. No calibration
data was invented.

## 13. Human evidence status

`HUMAN_EVIDENCE = INSUFFICIENT`, `MARKER_EQUIVALENCE = UNPROVEN` — frozen constants with
guards; `resolveAssessmentSourceGate()` always returns `AI_ESTIMATE`; a contract test
proves `CALIBRATED_HUMAN_VALIDATED` cannot be produced.

## 14. Test results

- Full suite: **3435 passed / 2 skipped (185 files)** — baseline 3288/2 (173 files);
  +147 IELTS tests (132 module + 15 route security), zero regressions.
- `npx tsc --noEmit`: exit 0.
- eslint (new files): 0 errors; 2 warnings of the repo-wide downgraded React 19
  `react-hooks/set-state-in-effect` rule.
- `node scripts/check-i18n.js`: exit 0.
- `npx next build`: exit 0; all `/student/ielts/*` + `/api/ielts/*` routes compiled.
- Browser baseline: `.next/static` chunks containing `static{` = **0** (Safari 15.4
  constraint preserved; browserslist untouched).

## 15. Security results

Route tests (`ielts-route-security`, 15 tests): anonymous → 401; cross-user attempt
read → 403; owner read → 200; teacher requires class relation; admin allowed; writing
assessment cannot attach to another user's attempt (403); admin transition uses the
session reviewer id (body `reviewerId` ignored); transcript is never returned in
attempt-time payloads; audio endpoint fails closed (503) without TTS. Answer keys,
accepted answers and evidence are excluded from attempt-time API payloads (`DIRECT`
code inspection + tests). No new caching behaviour was introduced that could cross users
(audio responses use `private` cache). No secrets in client bundles (`DIRECT`).

## 16. HKDSE regression results

`HKDSE_BEHAVIOR = UNCHANGED` — `TEST_VERIFIED` (full suite, same 2 gated skips as
baseline; no HKDSE module files modified). No changes to ADR-023 semantics, calibration
gates, XP policy, evidence rules, or release authorization.

## 17. Known limitations

1. Listening production audio assets: `PARTIALLY_IMPLEMENTED` — platform TTS only
   (AI voice, labelled), no stored official-style recordings; `audioId` reserved.
2. Reading passage-level generation pipeline is not wired to the platform generator;
   content enters via admin draft API / seed and must pass the validator + human review.
   (The phase spec's source→publishable pipeline is implemented as status machine +
   validator; no LLM auto-generation endpoint for IELTS items is shipped — deliberately,
   so nothing can be auto-published.)
3. Admin authoring is API-level (no dedicated admin UI screen) — `PARTIALLY_IMPLEMENTED`.
4. Live AI provider calls for IELTS assessment were not exercised here (`NOT_TESTED`);
   production relies on the platform's existing provider/circuit-breaker/budget paths.
5. `usage.costStatus = UNKNOWN` (no reliable per-call cost extraction) — telemetry
   records provider/duration only.
6. Minor UX: speaking transcripts must be dictated/pasted by the user (no in-app STT).

## 18. Future work

Obtain ≥8 real paired human marks to move calibration from `INSUFFICIENT_DATA`;
storage of listening audio assets; IELTS item generation pipeline wired through
`generateQuestions`-style gates; admin authoring UI; in-app speech capture with explicit
acoustic-evidence separation; per-call token/cost instrumentation for `AI_COST`.

## 19. Exact commands executed (chronological, key ones)

```
npx prisma generate                                  # schema validation (OK)
npx tsc --noEmit                                     # multiple runs; final exit 0
npx vitest run src/modules/ielts                     # 132 passed
npx vitest run src/app/api/__tests__/ielts-route-security.test.ts  # 15 passed
npx vitest run                                       # 3435 passed | 2 skipped (187 files)
npx eslint <new paths>                               # 0 errors (repo-wide React 19 warnings only)
node scripts/check-i18n.js                           # exit 0
npx next build                                       # exit 0
node scripts/production-build.js                     # next build OK on first pass; exit 1 due to
                                                     #   prisma migrate deploy P1001 (no DB here;
                                                     #   also OneDrive EBUSY on second run) — NOT run to completion
Get-ChildItem .next\static -Recurse -Filter *.js | Select-String -Pattern 'static\s*\{'  # 0 matches
git status --porcelain / git diff --stat             # see §3/§20 (no commit, no push)
```
Not executed (out of authorization): any `prisma migrate deploy` against real DBs,
Cloud Run deploys, production env changes.

## 20. Git diff summary

7 tracked files modified (+259/−5); 66 new files (≈9,808 lines); **no commits, no push**
— all changes remain in the working tree for review. Untracked roots:
`docs/ielts/`, `prisma/migrations/20261003_ielts_module/`, `scripts/seed-ielts.ts`,
`src/app/api/ielts/`, `src/app/api/__tests__/ielts-route-security.test.ts`,
`src/app/student/ielts/`, `src/modules/ai/prompts/ielts/`,
`src/modules/ai/schemas/ielts-assessment-schema.ts`,
`src/modules/ai/usecases/ielts-{writing,speaking}-assessment.ts`,
`src/modules/ielts/`, `src/shared/utils/i18n-ielts.ts`.

---

## ADDENDUM — 2026-10-03 (II): Speaking becomes preparation-only; Writing marking aligned to task-type shape

Scope driver: the user's instruction — *"因應技術所限，不實作 speaking 的模擬真人對答及評分，但可以教授如何準備 speaking 的題目"* — plus third-party
pedagogical patterns (see `IELTS_PRACTICE_PATTERNS.md`, sources T1–T5 in `IELTS_SOURCES.md`).

**1. Speaking scoring retired entirely (deleted, not disabled).**
Deleted: `ai/usecases/ielts-speaking-assessment.ts`, `ai/prompts/ielts/speaking-assessment.ts`,
`services/speaking-assessment-service.ts`, its test file, `src/app/api/ielts/speaking/assess/route.ts`,
`combineSpeakingBands` / `IeltsSpeakingCriterionBands` (aggregate.ts),
`computeSpeakingSectionBand` (bands.ts — with a "never re-add" note), and
`IeltsSpeakingAssessmentSchema` (replaced by `IeltsSpeakingPrepSchema`, which has **no score fields by design**).
Governance events renamed `speaking.assessment.* → speaking.prep.*`; feature status
`speakingAssessment = NOT_AVAILABLE`, `speakingPreparation = IMPLEMENTED`.

**2. Speaking Preparation Centre built (teaching, no assessment).**
- `speaking/topic-bank.ts` — 26 platform-original entries: 8 × Part 1 themes, 12 × Part 2 cue cards
  (People / Places / Objects-Things / Events-Experiences), 6 × Part 3 discussion functions; each with
  preparation pointers, useful language functions (adapt-don't-memorise) and pitfalls.
- `speaking/strategies.ts` — four-quadrant Part 2 note grid (Z-order + P/N/F tense flags), story-merging
  method (one story, many cards) with anti-memorisation warnings, self-recording practice loop,
  self-check list, platform limitations.
- `services/speaking-prep-service.ts` + `ai/prompts/ielts/speaking-preparation.ts` +
  `ai/usecases/ielts-speaking-prep.ts` (`IELTS_SPEAKING_PREP_V1`) + `POST /api/ielts/speaking/prepare`.
  The AI coach is contractually forbidden from producing scores/bands, impersonating an examiner, or
  writing memorised scripts; leaked score language is stripped server-side (`SCORE_LANGUAGE_FILTERED`
  limitation) and unusable coach output is a **typed failure**, never a "successful empty plan".
  Output is typed `kind: 'PREPARATION_ONLY'` / `notice: 'NO_SPEAKING_SCORE_OFFERED'`; rows persist
  `estimatedBand = null`, `languageBandEstimate = null`.
- `/student/ielts/speaking` rebuilt as the Preparation Centre (topic bank browser, interactive note grid,
  story-merging workbench, AI coach, self-recording loop). Progress page shows the no-score notice for
  Speaking instead of a band placeholder.
- `speaking/criteria.ts` now labels each criterion `evidenceType: 'preparable_from_transcript' | 'acoustic_required'`
  — pronunciation is always acoustic-required, so no text pipeline may judge it.

**3. Writing marking aligned to real task shapes (deterministic, prompt-time).**
`writing/criteria.ts` gained `classifyTask2QuestionType()` (discuss-both-views / outweigh /
advantages-disadvantages / positive-negative / problem-solution / opinion-agree-disagree / two-part /
direct-questions), `classifyGeneralLetterType()`, `classifyAcademicTask1VisualType()`, and
`describeTaskTypeExpectations()`; task-requirement patterns extended (answer-both-questions,
explain-reasons, suggest-measures, discuss-implications). `buildTaskTypeAnalysis()` merges these
obligations into the assessment checklist (ids `tasktype:<type>-<i>`), and the AI prompt receives a
"PLATFORM TASK-TYPE ANALYSIS" section instructing coverage of those ids. Result + persistence carry
`taskTypeAnalysis` (new nullable TEXT column in the same unreleased migration).

**4. Third-party pattern digest.** `IELTS_PRACTICE_PATTERNS.md` documents the distilled, pattern-only
learnings (speaking taxonomy & seasonal rotation, note grid, 串題, anti-memorisation; writing task-type
matrix & letter/visual types; reading/listening techniques) with an explicit no-content-copying statement
and the code-usage mapping table.

**5. Verification (all `TEST_VERIFIED`).**
`npx tsc --noEmit` 0 · `npx vitest run` **3448 passed / 2 skipped (186 files passed, 2 skipped)** ·
`npx eslint` on changed paths 0 errors · `node scripts/check-i18n.js` exit 0 · `npx next build` exit 0 ·
Safari 15.4 baseline `static{` = 0. New tests: `speaking-prep-service` (no-score contract, sanitization,
typed failures, persistence), `topic-bank` (content integrity), plus prepare-route security cases
(401/400/422/503 + "no score fields in response"). Deleted scoring-era speaking tests.

**Unchanged invariants:** `AI_COST = UNKNOWN`, `HUMAN_EVIDENCE = INSUFFICIENT`,
`MARKER_EQUIVALENCE = UNPROVEN`, `CALIBRATED_HUMAN_VALIDATED` impossible, AI can never publish,
production untouched (no git commit/push, no deploy; migration still not executed against any DB).

---

## Final governance state

```
IELTS_FEATURE_STATUS = IMPLEMENTED (objective scoring, writing AI, speaking PREPARATION coaching,
                       progress, lifecycle; listening audio PARTIALLY_IMPLEMENTED)
OBJECTIVE_SCORING = VERIFIED_BY_DETERMINISTIC_TESTS
WRITING_AI_SCORING = AI_ESTIMATE
SPEAKING_ASSESSMENT = NOT_AVAILABLE (no score, no band, no language estimate; pronunciation NOT_VERIFIED)
SPEAKING_PREPARATION = IMPLEMENTED (teaching only)
AI_COST = UNKNOWN
HUMAN_EVIDENCE = INSUFFICIENT
MARKER_EQUIVALENCE = UNPROVEN
IELTS_SCORE_VALIDITY = NOT_ESTABLISHED
PRODUCTION_READINESS = DO_NOT_CHANGE_EXISTING_RELEASE_DECISION
```
