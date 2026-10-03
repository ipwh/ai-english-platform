# IELTS Subsystem — Code Review Package (2026-10-03)

**Purpose.** A self-contained guide for reviewing the entire 2026-10-03 IELTS
work stream (Phases I–VII): what changed, why it is safe, where to look first,
and the exact evidence produced.

**Audience.** Any developer reviewing this change set before it is committed.

**Status.** All changes are **UNCOMMITTED** working-tree changes on top of
commit `0cce343` (2026-10-01). Nothing has been pushed or deployed.

- Modified tracked files: **11** (`git diff --stat`: +747 / −16)
- New (untracked) files: **97** (+ this report = 98)
- Verification: `tsc` 0 · **3537 passed / 2 skipped (192 files)** · eslint 0
  errors · `check-i18n` exit 0 · `next build` exit 0 · Safari-15.4 baseline
  `static{` = 0

---

## 1. What this change set is (executive summary)

An **isolated IELTS-style practice subsystem** (`src/modules/ielts/`), added
over seven phases on 2026-10-03:

| Phase | Deliverable |
|---|---|
| I | Core subsystem: domain (bands, conversion, word count), deterministic scorer, validators, status machine, catalogue/attempt services, repo, 10 API routes, student UI, docs |
| II | Speaking → **preparation only** (no scoring surface exists anywhere) |
| III | Compliance audit corrections (publication gates, count parity, multi-answer rejection, i18n) |
| IV | AI authoring: generation → machine screen → **blind-solve** → `QA_REQUIRED` only; teacher console; BETA labelling; Academic/GT variants |
| V | Starter content auto-provisioning (repo-authored only) + deploy-path migrations + concurrency fix |
| VI | AI mistake explanations (advisory only, never changes marks) |
| VII | **Instant self-study** (on-demand practice without weakening "AI never publishes") |

### Non-negotiable invariants (unchanged by all phases)

1. **AI never publishes.** `DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED
   → PUBLISHED`; publication requires a reviewer id taken from the session.
2. **Fully isolated from HKDSE.** Never writes HKDSE evidence / accuracy /
   mastery / mistakes / XP. Band values are practice **estimates** (ranges).
3. **Deterministic scoring is the only scoring authority.** Client correctness
   claims are ignored.
4. **Speaking is never scored** (no band, no pronunciation judgement).
5. **No fabricated validation claims.** `HUMAN_EVIDENCE = INSUFFICIENT`,
   `MARKER_EQUIVALENCE = UNPROVEN`, `AI_COST = UNKNOWN`, subsystem = **BETA**.

---

## 2. How to review (commands)

```powershell
# 1. Inventory
git status -uall                 # 11 modified + 97 new files
git diff                         # tracked-file diff (docs/config/deploy/i18n)

# 2. Reproduce the verification (after `npx prisma generate` — schema changed)
npx prisma generate
npx tsc --noEmit                 # expect: exit 0
npx vitest run                   # expect: 3537 passed / 2 skipped (192 files)
npx eslint src/modules/ielts src/app/api/ielts src/app/student/ielts src/app/teacher/ielts
node scripts/check-i18n.js       # expect: exit 0
npx next build                   # expect: exit 0
# Safari 15.4 baseline — must print 0:
(Get-ChildItem .next\static -Recurse -Filter *.js | Select-String -Pattern 'static\s*\{' | Measure-Object).Count
```

Full-suite baseline before this change set was **3507 / 2 skipped (191 files)**
— the delta is **+30 tests** (19 IELTS test files, 249 tests total).

**Suggested reading order (highest-risk first):**

1. `src/modules/ielts/validation/pipeline.ts` — the status machine (who may
   publish). Tests: `__tests__/pipeline.test.ts`, `__tests__/governance.test.ts`.
2. `src/modules/ielts/services/generation-service.ts` — generation gates
   (machine screen → blind-solve → QA_REQUIRED; fail-closed; honest shortfall).
   Tests: `__tests__/generation-service.test.ts`.
3. `src/modules/ielts/services/instant-practice-service.ts` +
   `src/modules/ielts/services/catalog-service.ts` — instant self-study gates
   (owner-only, never listed, HKT daily cap). Tests:
   `__tests__/instant-practice-service.test.ts`, `__tests__/catalog-service.test.ts`.
4. `src/modules/ielts/services/attempt-service.ts` +
   `src/modules/ielts/scoring/objective-scorer.ts` — server-authoritative
   scoring. Tests: `__tests__/attempt-service.test.ts`,
   `__tests__/objective-scorer.test.ts`.
5. `src/modules/ielts/services/mistake-explanation-service.ts` — advisory
   explanation, never changes marks. Tests: `__tests__/mistake-explanation-service.test.ts`.
6. `src/app/api/ielts/**` + `src/app/api/__tests__/ielts-route-security.test.ts`
   — authorization boundaries on all 19 routes.
7. `docs/ielts/IELTS_COMPLIANCE_AUDIT.md` — the governance claims register.

---

## 3. Where each invariant is enforced (review checklist)

| Invariant | Enforcement point | Pinned by |
|---|---|---|
| AI can never publish; reviewer id required | `validation/pipeline.ts` (`applyTransition`), `services/admin-service.ts` | `pipeline.test.ts`, `governance.test.ts`, route security tests |
| `CALIBRATED_HUMAN_VALIDATED` impossible while evidence INSUFFICIENT | `governance/states.ts` (`resolveAssessmentSourceGate`) | `governance.test.ts` (contract) |
| Generated items persist at `QA_REQUIRED` inside `DRAFT` only | `services/generation-service.ts` | `generation-service.test.ts` |
| Blind-solve verifier never sees answer keys; mismatch/ambiguous/flawed ⇒ item dropped | `generation-service.ts` (`verifyPreparedItems`) + `ai/usecases/ielts-question-generation.ts` | `generation-service.test.ts` |
| Instant practice is NOT publication: owner-only, never listed, cap 8/HKT-day, budget 503 | `instant-practice-service.ts`, `catalog-service.getTestForStudentAttempt`, repo origin filters, `attempt-service` start/submit, audio route, explanation service | `instant-practice-service.test.ts`, `catalog-service.test.ts`, `attempt-service.test.ts`, `ielts-route-security.test.ts` |
| Scoring deterministic & server-side; all client claims ignored | `scoring/objective-scorer.ts`, `attempt-service.submitIeltsAttempt` | `objective-scorer.test.ts`, `attempt-service.test.ts` |
| Speaking has no scoring surface (prep-only) | `services/speaking-prep-service.ts`, `ai/usecases/ielts-speaking-prep.ts` (schema has no score fields) | `speaking-prep-service.test.ts` |
| Mistake explanation can never change a mark; forbidden-claim screening | `services/mistake-explanation-service.ts` | `mistake-explanation-service.test.ts` |
| Starter carve-out applies ONLY to repo-authored content | `services/starter-content-service.ts`, `content/starter-sets.ts` | `starter-content-service.test.ts`, `starter-content.test.ts` |
| HKDSE isolation | no IELTS module imports HKDSE practice/XP/mistake stores — **verified 2026-10-03: 0 matches** (command below) | `docs/ielts/IELTS_COMPLIANCE_AUDIT.md` |
| BETA labelling, no official-score claims in UI text | `governance/states.ts`, `src/shared/utils/i18n-ielts.ts` wording contract | `governance.test.ts`, `scripts/check-i18n.js` |

Useful checks for reviewers:

```powershell
# 1. Every write path that could touch publication status:
Get-ChildItem src/modules/ielts -Recurse -Filter *.ts | Select-String -Pattern 'PUBLISHED'

# 2. Isolation — imports of HKDSE stores from IELTS code (observed: 0 matches):
Get-ChildItem src/modules/ielts, src/app/api/ielts, src/app/student/ielts, src/app/teacher/ielts -Recurse -Filter *.ts* |
  Select-String -Pattern "from '@/modules/(exercise|mistake|student|learning|gamification|achievement)"

# 3. Publication authority — reviewer id must come from the session only:
Get-ChildItem src/modules/ielts, src/app/api/ielts -Recurse -Filter *.ts* | Select-String -Pattern 'reviewerId'
```

---

## 4. Change inventory

### 4.1 Modified tracked files (11)

| File | Δ | Purpose |
|---|---|---|
| `prisma/schema.prisma` | +174 | All IELTS models; Phase VII adds `IeltsTest.origin` + `ownerUserId` + index |
| `src/modules/ai/index.ts` | +98 | Facade exports for IELTS usecases (assessment / prep / generation / verification / explanation) |
| `src/modules/ai/prompts/prompt-registry.ts` | +52 | 5 new prompt registrations (registry now #14–#18) |
| `cloudbuild.yaml` | +29/−21 | Step 1 `npm ci && npx prisma migrate deploy` (Secret Manager `DIRECT_DATABASE_URL`; fail ⇒ deploy aborts); concurrency 80 → **50** |
| `scripts/cloud-run-deploy.ps1` | +24/−12 | Step 2/4 runs `prisma migrate deploy` before deploying new code |
| `CHANGELOG.md` | +282 | Entries for Phases (II)–(VII) |
| `CLAUDE.md` | +94 | Architecture / ownership / test-count updates |
| `AGENTS.md` | +5/−3 | Key-rules bullet for the IELTS subsystem + changelog pointer |
| `src/shared/utils/i18n.ts` | +2 | Registers `ieltsTranslations` |
| `src/shared/utils/i18n-teacher.ts` | +1 | Teacher nav label |
| `src/shared/utils/nav.ts` | +2 | Teacher console entry `/teacher/ielts` |

### 4.2 New files (97, grouped)

**Docs (7):** `docs/ielts/{IELTS_SPECIFICATION, IELTS_SOURCES, IELTS_SCORING,
IELTS_ASSESSMENT_GOVERNANCE, IELTS_PRACTICE_PATTERNS, IELTS_IMPLEMENTATION_REPORT,
IELTS_COMPLIANCE_AUDIT}.md`

**Schema/migrations (2):** `prisma/migrations/20261003_ielts_module/`,
`prisma/migrations/20261003_ielts_instant_practice/`

**Scripts (1):** `scripts/seed-ielts.ts` (stops at QA_REQUIRED unless `--reviewer=`)

**Module — core (30):** `src/modules/ielts/`: `index.ts`; `repositories/ielts-repo.ts`;
`domain/{types,bands,conversion,normalization,word-count}.ts`;
`scoring/{objective-scorer,aggregate}.ts`;
`validation/{question-validator,pipeline}.ts`;
`governance/{states,calibration,events}.ts`;
`services/{catalog,attempt,progress,admin,generation,instant-practice,
mistake-explanation,starter-content,speaking-prep,writing-assessment,row-mappers}.ts`;
`content/starter-sets.ts`; `writing/criteria.ts`;
`speaking/{criteria,topic-bank,strategies}.ts`

**Module — tests (19):** `src/modules/ielts/__tests__/`: `{attempt-service,bands,
catalog-service,conversion,generation-service,golden-fixtures,governance,
instant-practice-service,mistake-explanation-service,objective-scorer,pipeline,
speaking-prep-service,starter-content-service,starter-content,topic-bank,
validation,word-count,writing-assessment-service}.test.ts` + `fixtures/golden.ts`

**AI support (11):** `src/modules/ai/prompts/ielts/{writing-assessment,
speaking-preparation,question-generation,materials-reference,mistake-explanation}.ts`;
`src/modules/ai/schemas/{ielts-assessment-schema,ielts-generation-schema}.ts`;
`src/modules/ai/usecases/{ielts-writing-assessment,ielts-speaking-prep,
ielts-question-generation,ielts-mistake-explanation}.ts`

**API routes (19):** `src/app/api/ielts/`: `tests/`, `tests/[id]/`,
`attempts/`, `attempts/[id]/`, `attempts/[id]/submit/`, `practice/instant/`,
`writing/assess/`, `writing/prompts/`, `speaking/prepare/`, `mistakes/explain/`,
`progress/`, `status/`, `sections/[id]/audio/`, `admin/questions/`,
`admin/questions/[id]/validate/`, `admin/questions/[id]/transition/`,
`admin/tests/`, `admin/tests/[id]/transition/`, `admin/generate/`

**Route security tests (1):** `src/app/api/__tests__/ielts-route-security.test.ts`

**UI pages (6):** `src/app/student/ielts/{page, writing/page, speaking/page,
progress/page, tests/[id]/page}.tsx`, `src/app/teacher/ielts/page.tsx`

**i18n (1):** `src/shared/utils/i18n-ielts.ts`

---

## 5. Phase VII highlight — instant self-study (last change, most scrutiny)

`POST /api/ielts/practice/instant` lets any logged-in student generate a set on
demand. This is deliberately **NOT publication**:

- Persisted state is identical to authoring: `DRAFT` test +
  `QA_REQUIRED` questions; `origin='INSTANT'`, `ownerUserId=student`.
- Same gates as authoring (machine screen + blind-solve, fail-closed).
- Owner-only on **every** surface: test load, attempt start, submit/scoring,
  listening audio, AI explanation. Non-owner → 403/404; `REJECTED` sets are
  closed even to the owner.
- Never listed: catalogue filters `origin='CATALOGUE'`; starter-content
  provisioning counts catalogue tests only.
- Labelled unreviewed everywhere (runner banner, teacher console badge,
  explanation limitation).
- Cost bounded: 8 sets/student/HKT-day (`hkStartOfDay`), route 6/min, budget
  errors propagate (503).
- Graduation: teacher review + publish flips `origin → 'CATALOGUE'`.

Review-specific questions for this phase:
1. Can any surface deliver an instant set to a non-owner? (see the checklist
   row above; all five surfaces are covered by tests)
2. Can an instant set ever appear in the catalogue or count toward starter
   provisioning? (repo filters + tests)
3. Can generation ever persist anything at/above `HUMAN_APPROVED`? (no —
   `generation-service` asserts the system path ends at `QA_REQUIRED`)

---

## 6. Verification evidence (observed 2026-10-03)

| Command | Result |
|---|---|
| `npx vitest run` | **3537 passed / 2 skipped (192 files passed, 2 skipped)** — the 2 skips are pre-existing gated suites (`TEST_DATABASE_URL` / evidence-SQL) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint <changed paths>` | 0 errors (3 pre-existing `react-hooks/set-state-in-effect` warnings; repo-wide downgraded rule) |
| `node scripts/check-i18n.js` | exit 0 — no hardcoded Chinese outside i18n |
| `npx next build` | exit 0 |
| Safari 15.4 baseline `static{` grep | 0 matches |
| HKDSE-store imports from IELTS code (isolation check) | 0 matches |
| IELTS-focused run | 19 files / 249 tests passed |

---

## 7. Known limitations & deliberate boundaries (not defects)

- **No human calibration exists** → BETA; all bands are range estimates;
  subsets return `NOT_COMPARABLE_SUBSET`. Claiming otherwise would be fabrication.
- **Instant sets appear in the teacher QA queue** (`listTestsForAdmin`, take
  100) and per-question admin listing (take 200). Volume from many students
  could crowd the queue; acceptable now (per-student cap bounds cost), flagged
  as a follow-up.
- `ielts.instant.dailyLimit` UI text states “8” — kept in sync with
  `IELTS_INSTANT_PRACTICE_DAILY_LIMIT` by a source comment (no shared constant
  import in client code by design).
- Dedupe material for generation is “recent prompts + recent section-text
  prefixes” (bounded take) — not exhaustive semantic dedupe.
- **Migrations (updated 2026-10-03 (XII)): renamed to enforce application order
  and APPLIED to production** — `20261003000100_ielts_module` →
  `20261003000200_ielts_instant_practice` →
  `20261003000300_ielts_assessment_rubric_version` (the old ordering hit P3018 on
  any fresh database). See `CHANGELOG.md` (XII) for the production incident
  (missing tables → instant practice 500) and the publish-walk fix.
- `materials/IELTS/` books are pattern-extraction only; no book text/items
  exist in code, prompts or DB (`docs/ielts/IELTS_SOURCES.md` §M1–M3).

## 8. Deployment notes (for the reviewer, not an instruction to deploy)

- `cloudbuild.yaml`: Step 1 runs `npm ci && npx prisma migrate deploy` with
  Secret Manager `DIRECT_DATABASE_URL`; failure aborts the deploy (prevents
  “new code + old schema”). Concurrency = 50 (post-incident baseline).
- `scripts/cloud-run-deploy.ps1`: Step 2/4 migrates before any deploy step.
- Migrations are additive only (`IeltsTest.origin` defaults to `'CATALOGUE'`;
  `ownerUserId` nullable) — **no backfill required**; existing rows read as
  catalogue content.
- Deploying to production requires explicit owner authorization and is outside
  this change set.

---

*Prepared 2026-10-03. Companion docs: `docs/ielts/IELTS_COMPLIANCE_AUDIT.md`
(claims register), `docs/ielts/IELTS_SPECIFICATION.md` (contracts),
`CHANGELOG.md` (phase entries (II)–(VII)).*

---

## Addendum — post-review engineering audit (later on 2026-10-03)

A full engineering audit (report with matrices:
`docs/ielts/IELTS_FULL_AUDIT_2026-10-03.md`) closed two real gaps and added
executable audit invariants. Reviewers should include this delta:

- **`AI_MISSING_EVIDENCE`** — a writing criterion with an EMPTY evidence array
  now fails the whole assessment (previously only lowered confidence); typed
  FAILED audit row, never a successful evidence-less score.
- **Version stamping** — `IELTS_WRITING_RUBRIC_VERSION` (`ielts-writing-rubric-v1`)
  + `IELTS_TASK_SPECIFICATION_VERSION` (`ielts-task-spec-v1`); rubricVersion
  persisted on `IeltsAssessment` (migration
  `20261003_ielts_assessment_rubric_version`, source-only); `specVersion` in the
  task-type analysis JSON.
- **`src/modules/ielts/__tests__/audit-invariants.test.ts`** — source scans
  (IELTS↔HKDSE imports both directions = 0, prohibited provenance labels = 0,
  prompt/rubric versioning) + objective-scoring determinism + speaking
  NOT_VERIFIED pins.
- Verification moved to **3547 passed / 2 skipped (193 files)**; tsc / eslint /
  i18n / build / Safari baseline unchanged (all green).
- Migrations pending deployment authorization: `20261003_ielts_module`,
  `20261003_ielts_instant_practice`, `20261003_ielts_assessment_rubric_version`.

**Update (2026-10-03 (XII)):** the three migrations were renamed
(`20261003000100_ielts_module` → `20261003000200_ielts_instant_practice` →
`20261003000300_ielts_assessment_rubric_version`) to fix an alphabetical-ordering
P3018 abort, and were APPLIED to the production database. The publish-path
deadlock (single-action `PUBLISHED` from `DRAFT` → `ILLEGAL_TRANSITION`) and the
writing-bank gap were fixed in the same change set — see `CHANGELOG.md` (XII).
