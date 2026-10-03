# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek (primary) → Grok (fallback); Gemini Flash / Flash-Lite entries remain in the chain but their API key was retired 2026-08-20; Claude/OpenAI placeholders. **DeepSeek V4.1 thinking mode is opt-in** — the provider sends `thinking: {type:'disabled'}` unless the caller passes `thinking: true` (the API default ignores `temperature` and spends `max_tokens` on `reasoning_content`; see CHANGELOG 2026-09-15)
- **Testing**: Vitest 4, 3559 pass / 2 skipped (193 files passed, 2 skipped — fully green; IELTS module suite incl. audit-invariants source scans (isolation both directions, prohibited provenance labels, prompt/rubric versioning, scoring determinism, cache + anti-injection scans), answer-leak/contraction guards, strict four-component overall band, instant self-study gates (owner-only delivery, daily cap, never-listed), mistake-explanation advisory gates, starter-content provisioning gates, generation gates (machine screen + blind-solve + QA_REQUIRED ceiling), speaking-prep no-score contract, compliance-audit gates, 2026-10-03). The 2 skipped are gated: one needs `TEST_DATABASE_URL`, one is the DB-gated evidence-SQL suite (runs in CI via `DATABASE_URL`, or with `EVIDENCE_SQL_TEST=1`)
- **Build**: `node scripts/production-build.js` (exit 0) — 正式建構（`npm run build:prod`）；Vercel 已於 2026-09-15 移除，唯一部署目標為 Cloud Run。**部署必先套用遷移**（2026-10-03 V）：`cloudbuild.yaml` Step 1 執行 `prisma migrate deploy`（Secret Manager `DIRECT_DATABASE_URL`；失敗即中止），`scripts/cloud-run-deploy.ps1` Step 2 亦先遷移；Cloud Build 併發 = 50（事故基線）
- **Key modules**: 23 under `src/modules/` (including 5 AI infra + foundation modules, `listening/` — the server-owned listening question store added 2026-09-21 — and `ielts/` — the isolated IELTS-style practice subsystem added 2026-10-03)
- **API routes**: 115 under `src/app/api/`
- **Architecture**: Facade→UseCase→Service→Repository→Prisma — single pipeline, single owner per responsibility
- **AI Pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. 11/13 use cases use canonical pipeline. `callLLM()` is re-exported by the facade for route-level raw-text calls (R3.10-L).
- **AI Facade**: 63+ exported symbols (incl. types) — API routes use `@/modules/ai` (few documented exceptions: `rag` route uses vertex-embeddings, `reading` route uses prompt builders, `generate-model-essay` uses core modules). Answer verification adds `verifyGeneratedAnswers` / `inspectGeneratedQuestion` / `summarizeVerificationDrops`; IELTS adds `assessIeltsWritingWithAI` / `prepareIeltsSpeakingWithAI` / `generateIeltsQuestionSetWithAI` / `verifyIeltsItemsWithAI` / `generateIeltsWritingPromptWithAI` / `verifyIeltsWritingPromptWithAI` / `explainIeltsMistakeWithAI` (+ prompt-version constants)
- **Prompt Registry**: 17 prompts registered in `ai/prompts/prompt-registry.ts` — centralized discovery & versioning (13 + IELTS writing assessment, speaking preparation, question generation, item verification, 2026-10-03)
- **AI Module**: 19 directories, 212 non-test TS files (includes Shared PromptOps Foundation, prompt-versioning, regression, experiments, continuous-evaluation, answer verification)
- **Shared PromptOps Foundation**: `src/modules/ai/foundation/` — BaseRegistry, VersionedRegistry, HistoryRegistry, BaseRunner, PipelineRunner, LifecycleEngine, ReportBuilder, EventBus, MetricsCollector, Repository/MemoryStore, Validator. 36 files, 0 external deps, strict PromptOps→Foundation dependency direction. 256 contract tests.
- **Runtime**: 7 files — circuit-breaker, budget-policy, ai-usage-store, capacity-planner, provider-policy, regression-detector, saturation-detector
- **Tooling**: `scripts/benchmark-ai.ts`, `scripts/load-test.ts`, `scripts/validate-prompts.ts`, `scripts/reliability-report.ts`, `scripts/prompt-version.ts`, `scripts/evaluate-regression.ts`, `scripts/experiment.ts`, `scripts/monitor.ts`, `scripts/set-academic-year.ts`, `scripts/unassign-non-roster.ts`, `scripts/diagnose-db-egress.ts`, `scripts/verify-evidence-sql-equivalence.ts`, `scripts/verify-activity-metrics-parity.ts`, `scripts/db-query-stats.ts`, `scripts/profile-requests.ps1`
- **AI Infra CLI**: `npm run prompt:*` (list/history/diff/snapshot/changelog/release/states), `npm run evaluate:*`, `npm run prompt:experiment:*`, `npm run prompt:monitor:*`, `npm run calibration:*` (ingest/report/intake/verify/marker-pack/marker-intake/adjudicate/freeze)
- **Shared utilities**: `computeWeightedScore()`, `skillLabelZh()`, `memoryService`, `BaseRuleEngine`, `CLO_RUBRIC`, `CLO_RUBRIC_ZH`, `hkDayKey()`（香港日界線，`shared/utils/hk-date.ts`）
- **i18n**: 19 files (18 module files + i18n.ts), 1661 unique keys (zh/en pairs), check: `node scripts/check-i18n.js` (exit 0 = no hardcoded Chinese)
- **Deployment Readiness**: Engineering baseline stable; formative self-study features available. Writing evaluation architecturally hardened; empirical marker calibration not available.
- **AI Quality**: DSE reading 8.2/10 (2026-08-04 manual 14-generation snapshot) — DeepSeek primary, 6-condition retry, JSON repair (8 active steps), paragraph ref verification
- **Writing Analysis Pipeline**: 3-evaluator architecture (Semantic + Style → Grammar/CLO), evidence-only semantic layer, CLO sole score authority, deterministic normalization, rubric single source of truth, golden benchmark runner, prompt injection defended, fail-open (Sprints 127-130 hardened)
- **Calibration Evidence Pipeline (Phase 9)**: intake (level-only rejected) → verify (verifiedBy+verifiedAt+confirmedSourceHash) → marker-pack/append (append-only, no AI fields) → adjudication (never mutates marks) → freeze (fail-closed). Gate sufficiency = verified overall-comparable pairs (min 8; current 0 — INSUFFICIENT_DATA). HKEAA publishes no per-script marks; validity never claimed
- **Writing Architecture Invariants** (8 enforced by contract tests):
  1. Semantic Evaluator = evidence only (no score/penalty/ceiling)
  2. CLO Evaluator = sole score authority
  3. overallCoverage ≠ Content score (no mechanical mapping)
  4. RAG similarity ≠ student score
  5. Semantic failure → fail-open (no score reduction)
  6. overallScore = deterministic from CLO (LLM overridden)
  7. PEEL/五大鋪墊法 = teaching heuristics, NOT rubric requirements
  8. Student essay = untrusted data (prompt injection defended)
- **Golden Benchmark**: 17 fixtures in `ai/evaluation/fixtures/writing-golden/` (5 sample + 12 calibration), runner in `ai/evaluation/golden-runner.ts` (MAE/RMSE/bias), all `expected` null (awaiting human calibration)
- **Continuous Evaluation Durability**: EvaluationStore (MemoryStore/Repository), crash recovery with at-least-once replay + idempotent side effects, generation-scoped exactly-once, metrics dedup, terminal-state immutability, recovery serialization, 165+ CE integration tests
- **Layout**: v6 block lines + floating line-number gutter (`.dse-line` + `.dse-line-gutter` + justify text); paragraph labels above; layout locked once per generation (selection-safe, no innerHTML)
- **Browser translation**: blocked at the app shell — `<html translate="no">` + `metadata.other = { google: 'notranslate' }` in `src/app/layout.tsx`. Browser auto-translation rewrites text nodes (wraps them in `<font>`) and breaks React's `removeChild`, crashing the page into `src/app/error.tsx` (2026-09-23). Machine translation also corrupts DSE line numbering and answer matching; the app ships its own lang cookie/i18n and `/api/ai/translate` instead.
- **Debug**: `DEEPSEEK_DEBUG=true` for full API request/response logging

## Architecture (Post-Sprint 130 — Writing Evaluation Hardened, Production-Ready)
```
Routes (115) → AIFacade → UseCases (13) → executeAI / executeAIRaw / callLLM
                  ├─ Prompts (PromptRegistry + builders)
                  ├─ Providers (6-model chain + circuit-breaker)
                  ├─ Services (RAG, TTS, evaluator, enrichment)
                  └─ Schemas (Zod validation)

Writing Evaluation (Sprints 127-130):
  Semantic Evaluator (evidence-only) → CLO Evaluator (score authority) → Deterministic Normalization
    ├─ CLO_RUBRIC / CLO_RUBRIC_ZH → single source (writing-rubric.ts)
    ├─ Golden Benchmark Runner → MAE/RMSE/bias (golden-runner.ts)
    └─ RAG → reference context only (never scoring)

Question Generation — Pre-Delivery Answer Verification (2026-09-20 ADR-042 / 2026-09-21 ADR-044):
  generateQuestions → normalize → validateAndFixQuestion → verifyGeneratedAnswers → retry if short
    ├─ Cross-request dedupe (2026-10-01, ADR-047): every caller MUST pass the student's recent
    │    14-day question texts (`recentPrompts`) and recently used listening dialogues
    │    (`recentContexts`, from the canonical ListeningQuestion store). The generator
    │    hard-excludes exact repeats (question text / dialogue) and feeds rejection reasons
    │    into the top-up prompt; excluded items are topped up, never silently dropped.
    │    Entry points: /api/ai/generate-questions, /api/daily-challenge, /api/diagnostic/grammar.
    │    Reading passages are not persisted → passage-level dedupe is not possible yet (known).
    ├─ Count contract (2026-09-25): rounds ACCUMULATE accepted items and top up only the
    │    deficit (MAX_ROUNDS = 3) — never "regenerate the whole batch, return the last
    │    round". Callers inject their own delivery condition (e.g.
    │    `isDeliverableListeningMc`) via `GenerateQuestionsOptions.acceptQuestion` so the
    │    top-up loop compensates for items the delivery layer would drop.
    │    Quality parity: every round (incl. the JSON-repair path) runs the SAME gates
    │    (structure → answer verification → delivery condition → per-item QA, fail-closed
    │    per item); dedupe keys include the attached dialogue/passage; the top-up prompt
    │    carries the rejection reasons; a failed round returns the items already accepted
    │    (original error type preserved so BudgetExceededError still maps to 503).
    ├─ Layer A (deterministic, zero cost): option count / duplicates / invalid key letter /
    │    fallback-filler option / explanation self-admits the item is defective
    ├─ Layer B (independent LLM pass, blind): verifier never sees the answer key;
    │    soundness ok | ambiguous | flawed + blind answer vs key
    │    · deterministic types keep EXACT answer equality
    │    · AI-scored short answers opt into `verificationAnswerMatch: 'overlap'`
    │      (content-word overlap) so rewording does not drop valid items
    └─ dropped items → retry with feedback (summarizeVerificationDrops); repair path also gated
  Reading delivery: keeps every verified item and only fails (structured 422
    ANSWER_VERIFICATION_FAILED + details) when fewer than MIN_VERIFIED_READING_QUESTIONS
    survive — never an opaque all-or-nothing 500; client retries once automatically

Listening — Server-Owned Question Store (2026-09-21 ADR-045):
  generateQuestions (languageSkill: 'listening', acceptQuestion = isDeliverableListeningMc)
    → top-up loop replaces items with no verbatim answer → isDeliverableListeningMc() final gate
    → persistGeneratedListeningQuestions() → server ids returned to the client
    ├─ deliverable = mc + non-empty dialogue + answer appears VERBATIM in the dialogue
    │    (word-boundary; option prefixes tolerated); undeliverable items dropped + logged
    ├─ nothing deliverable ⇒ structured 422 LISTENING_QUESTIONS_NOT_DELIVERABLE (retryable)
    └─ persistence failure ⇒ nothing delivered (never a client-side key)
  submit → resolveSubmissionAuthorityClass() resolves 3 stores → 'listening'
    → scoreListeningAnswers() (listening-server-exact-match) → verified evidence
    · client correctAnswer/isCorrect/awardedScore/maxScore/countsTowardScore ALL ignored
    · unresolvable id / invalid marks / open-ended type ⇒ NOT_PROJECTABLE (no partial scoring)
    · scoring unavailable ⇒ fail-open legacy persistence (unverified, no evidence/mistakes/mastery)
  Invariant: submissionClass alone never authorises side effects — usedServerScoring must also
    hold (mistakes + mastery gating), otherwise client-key rows would become trusted data.

IELTS — Isolated Practice Subsystem (2026-10-03, PHASE IELTS-01):
  src/modules/ielts/ — IELTS-style practice (NOT the official test), fully isolated from
    HKDSE evidence/accuracy/mastery/mistakes/XP. Docs: docs/ielts/ (SPECIFICATION, SOURCES,
    SCORING, ASSESSMENT_GOVERNANCE).
    ├─ Domain: bands (whole/half only; official .25↑/.75↑ rounding), word-count policy
    │    (hyphenated = single word), versioned raw→band conversion (official anchor points
    │    → RANGE estimates, provenance in every estimate), conservative normalization
    ├─ Scoring: scoreIeltsItem() — deterministic, server-only; over-limit answers lose the
    │    mark; numbers figures↔words; acceptedAnswers authored before publication only
    ├─ Validation: machine screen (evidence spans slice-match passages; listening answers
    │    verbatim in transcripts / MC-matching checked by correct OPTION TEXT; MC key/options
    │    checks; ONE answer per numbered question — multi-answer items rejected) + status
    │    machine DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED → PUBLISHED (AI never
    │    publishes; reviewer stamp required)
    ├─ AI authoring (2026-10-03 IV): generation-service.ts — generate (DeepSeek) →
    │    deterministic screen → independent BLIND-SOLVE verification (verifier never sees
    │    keys; mismatch/ambiguous/flawed/unavailable ⇒ item dropped, fail-closed) →
    │    QA_REQUIRED inside a DRAFT test. Writing prompts use a conformance checker.
    │    scope='set' (3–14 reading / 3–10 listening) or 'full_component' (official 40:
    │    13+13+14 / 10×4). Honest meta (dropped reasons + shortfall); nothing persists when
    │    nothing survives; budget errors propagate (503). Entry: POST /api/ielts/admin/generate
    │    (teacher/admin). Prompts: ai/prompts/ielts/{question-generation,materials-reference}.ts
    │    (official blueprints + instruction phrasings; materials/IELTS books are pattern-only
    │    and excluded from the deploy image).
    ├─ Writing: assessIeltsWriting() — 4 official criteria, verbatim-evidence verification
    │    (hallucinated quotes stripped; majority-hallucination ⇒ AI_EVIDENCE_MISMATCH;
    │    empty-evidence criterion ⇒ AI_MISSING_EVIDENCE — audit 2026-10-03), rubric +
    │    task-spec versions stamped (rubricVersion column / specVersion in task type
    │    analysis), forbidden-claim filter, requirement coverage, SERVER-computed task band,
    │    Task 2 double weighting (scoring/aggregate + domain/bands), deterministic
    │    task-type analysis (classifyTask2QuestionType / classifyGeneralLetterType /
    │    classifyAcademicTask1VisualType → obligations merged into the checklist as
    │    `tasktype:<type>-<i>` and passed to the prompt as the platform task-type section)
    ├─ Speaking: PREPARATION ONLY — no scoring surface exists (2026-10-03 II).
    │    Retired & deleted: speaking assessment service/usecase/prompt/route/tests,
    │    combineSpeakingBands, computeSpeakingSectionBand (never re-add),
    │    IeltsSpeakingAssessmentSchema → IeltsSpeakingPrepSchema (NO score fields).
    │    Delivered instead: topic bank (speaking/topic-bank.ts: Part1/2/3, People/
    │    Places/Objects/Events taxonomy), methods (speaking/strategies.ts: 4-quadrant
    │    note grid, story merging, self-recording loop, self-check), AI prep coach
    │    (prepareIeltsSpeakingWithAI, IELTS_SPEAKING_PREP_V1 → POST
    │    /api/ielts/speaking/prepare). Coach output is kind:'PREPARATION_ONLY',
    │    notice:'NO_SPEAKING_SCORE_OFFERED'; leaked score language is stripped
    │    (SCORE_LANGUAGE_FILTERED); rows persist estimatedBand/languageBandEstimate
    │    null. criteria.ts marks each criterion preparable_from_transcript |
    │    acoustic_required (pronunciation always acoustic_required).
    │    Speaking assessment & pronunciation scoring = NOT_AVAILABLE; no examiner
    │    simulation exists.
    ├─ Mistake explanation (2026-10-03 VI): explainIeltsMistake() — advisory
    │    "why your wrong answer fails" for OBJECTIVE items (owner + SUBMITTED + verdict
    │    'incorrect' only; 403/404/409 otherwise, AI never called). Never changes a mark
    │    (deterministic scoring stands); band/examiner wording stripped sentence-wise
    │    (FORBIDDEN_CLAIM_FILTERED; all-filtered ⇒ 422 AI_OUTPUT_FILTERED); quotes the
    │    passage/transcript; prompt injection defended; POST /api/ielts/mistakes/explain.
    ├─ Instant self-study (2026-10-03 VII): generateIeltsInstantPractice() — on-demand
    │    practice WITHOUT weakening the no-publish invariant. IeltsTest.origin='INSTANT'
    │    + ownerUserId; delivered to the requester ONLY, labelled "not teacher-reviewed";
    │    never listed (catalogue filters origin='CATALOGUE'); same machine screen +
    │    blind-solve gates; persisted state stays DRAFT + QA_REQUIRED. Non-owner blocked
    │    on EVERY surface (load/start/submit/audio/explanation). Cap: 8 sets per student
    │    per HKT day + route rate limit + AI budget gate (503). Owner may get advisory
    │    explanations; teacher publish flips origin → CATALOGUE (graduation).
    │    POST /api/ielts/practice/instant; migration 20261003_ielts_instant_practice.
    └─ Governance: HUMAN_EVIDENCE = INSUFFICIENT, MARKER_EQUIVALENCE = UNPROVEN,
         CALIBRATED_HUMAN_VALIDATED impossible (guarded + contract test), calibration
         report INSUFFICIENT_DATA until ≥8 REAL paired human marks, AI_COST = UNKNOWN.
         Subsystem status = BETA (IELTS_SUBSYSTEM_STATUS; no human calibration) — shown
         as a badge in the UI and returned by /api/ielts/status.
         Starter content (2026-10-03 V): ensureStarterContent() auto-provisions
         content/starter-sets.ts (repo-authored, machine-screened) as PUBLISHED on the
         first catalogue load when the subsystem is empty — carve-out NEVER applies to
         AI content; idempotent + P2002 race-safe; provisioning failure never breaks reads.
  API: /api/ielts/* (tests, attempts + submit, practice/instant (on-demand self-study,
       owner-only, never listed), writing/assess, writing/prompts (published
       prompt bank), speaking/prepare, mistakes/explain, progress, status, admin
       questions workflow, admin/tests(+transition) authoring console, admin/generate
       (AI authoring), sections/[id]/audio via platform TTS with explicit AI-voice
       provenance).
       UI: /student/ielts/* (dashboard with Academic/GT variant explainer + Beta badge,
       instant self-study panel (clearly labelled unreviewed),
       runner, writing (mode-first task selection + prompt bank), speaking preparation
       centre, progress) + /teacher/ielts (generation + per-question QA + publish console).
       Seed: scripts/seed-ielts.ts (stops at QA_REQUIRED unless --reviewer=).
       Pattern digest: docs/ielts/IELTS_PRACTICE_PATTERNS.md.
       Compliance audit (2026-10-03): docs/ielts/IELTS_COMPLIANCE_AUDIT.md.

Practice Evidence Aggregation — Server-side (2026-09-26, ADR-046):
  Cumulative projections (accuracy / weekly snapshot / per-skill totals / admin export)
    → practice-evidence-rules.ts (SINGLE rule definition, shared by TS + SQL)
    → practice-repo.aggregateVerifiedTotals*() (one row per student/skill; session-level
       all-or-nothing reproduced in SQL — a naive row WHERE would OVER-count)
    → StudentStateMutationService.syncActivityMetrics (fail-closed: read failure THROWS;
       never catch-to-empty, which would silently overwrite a correct accuracy with null)
  Measured: full-school projection 3.2 MB → 55 KB; admin export 2.4 MB → 82 rows.
  Gates: practice-evidence-sql-equivalence (22 adversarial fixtures, rolled back),
    db:verify:evidence-sql (real data), db:verify:metrics-parity (deploy gate, 0 diffs).
  NOT an egress target: /api/notifications = 94% of requests but returns 0 rows.

Supporting modules:
  student/ — mastery, profile (canonical owner)
  learning/ — decisions, pipeline (canonical owner)
  curriculum/ — HKDSE data (canonical owner)

Mistake Book (2026-09-14, ADR-041):
  exercise/services/mistake-skill-identity.ts — 正典技能歸屬（ReadingQuestion.dseType /
    GrammarQuestion.grammarItem）；客戶端自報值只作白名單後備，標記 skillSource
  mistake/intelligence/services/mistake-skill-breakdown.ts — 分桶（題型 > 文法項目 > 錯誤類型），
    標示 replayable；錯題頁與 aggregateMistakes() 共用
  mistake/intelligence/services/mistake-strategy.ts — 確定性雙語題型策略卡（非 AI）
  mistake/db/repositories/mistake-repo.ts — listDueMistakesForReview（到期 + 可重考）
  mistake/db/services/mistake-tracker.ts — nextMistakeReviewState（SM-2，單一排程 owner）

Shared PromptOps Foundation (new in Sprint 125):
  ai/foundation/ — 21 files, 0 deps, strict PromptOps→Foundation direction
    registry/ — BaseRegistry<T>, VersionedRegistry<T>, HistoryRegistry<T>
    runner/ — BaseRunner, PipelineRunner
    lifecycle/ — LifecycleEngine<S>, StandardLifecycleState
    report/ — ReportBuilder, MarkdownRenderer, JSONRenderer, ConsoleRenderer
    events/ — EventBus, EventDispatcher, 12 typed PromptOps events
    metrics/ — MetricsCollector, Counter, Gauge, Histogram, Timer, RollingAverage
    storage/ — Repository<T>, MemoryStore<T>
    validation/ — validate(), assert(), collectErrors(), common rules
    types.ts, index.ts — barrel exports, SemVer, Identifiable, Versioned, etc.

AI Infrastructure (Sprint 122-124, hardened in Sprint 125):
  ai/prompt-versioning/ — PromptVersionRegistry, SemVer, lifecycle (7 states), release management, diff, changelog, snapshots
  ai/regression/ — RegressionRunner, rubric/semantic/structural scoring, golden fixtures, evaluation reports
  ai/experiments/ — ExperimentRunner (A/B/C, cross-provider/version/temperature/dataset/seed), statistics engine, winner selection, confidence scoring
  ai/continuous-evaluation/ — Monitor (scheduled eval, idempotent finalization, generation guards, EventBus terminal events), drift detector (8 dims), regression monitor, provider monitor, quality trends, alert engine, baseline manager, durable EvaluationStore (MemoryStore/Repository), crash recovery (at-least-once replay + idempotent side effects), recovery serialization, metrics dedup, terminal-state immutability

Dev tooling:
  scripts/benchmark-ai.ts, load-test.ts, validate-prompts.ts, reliability-report.ts
  scripts/prompt-version.ts (version management CLI)
  scripts/evaluate-regression.ts (regression evaluation CLI)
  scripts/experiment.ts (A/B experiment CLI)
  scripts/monitor.ts (continuous evaluation CLI)
  scripts/evidence-intake.ts, evidence-verify.ts, marker-pack.ts,
  marker-intake.ts, adjudication-intake.ts, freeze.ts (Phase 9 evidence pipeline CLI)
  .github/workflows/regression.yml, experiment.yml, continuous-evaluation.yml
  ai/benchmark/ — benchmark framework (used by CLI)
  ai/evaluation/ — EvaluationEngine (used by SRE dashboard)
  ai/assessment/ — AssessmentEngine (used by SRE dashboard)
```

## Ownership (Single Owner per Responsibility)
- 香港日界線（Hong Kong Day Keys）: `shared/utils/hk-date.ts` — 所有「日」的判定（連續天數、活躍日、週界線、每日目標、今日 XP）。**禁止**在業務程式碼用 `toISOString().slice(0,10)` 當「日」（UTC 日界線會令香港早上的活動歸入前一日，造成假缺口）
- 連續天數（連續練習天數）: `student/progress/services/streak-service.ts` — 香港日界線 + 400 日回溯 + 嚴格相鄰日 key；只計有練習的日子（`LoginLog` 實際未被寫入）；`countStreak` 為純函式
- 累積練習投影（技能掌握度題數 / 每週摘要）: `exercise/services/practice-history-service.ts` — 日期界線 + 正典 `evaluatePracticeEvidence`；**永不**由「最新 N 筆」切片推算（會令累積數字下降）。**2026-09-26（ADR-046）**：累積投影一律走 **SQL 聚合**（`PracticeRepo.aggregateVerifiedTotalsBySkillForStudent`），只回傳每技能一列；**永不**逐列搬全歷史（3.2 MB → 55 KB）
- 練習歷史（學生端＋教師端逐日檢視；2026-10-01）: `exercise/services/practice-history-service.ts` — 月摘要＝DB 端（每日 × 技能）聚合（`aggregatePracticeSessionsByDayAndSkill`；只回傳聚合列）、日明細＝單日有界（`getPracticeHistoryDay`，附正典證據投影；教師逐題明細 `getPracticeHistoryDayForTeacher`）；API `/api/practice/history`（`includeAnswers=1` **僅教師／管理員**）；**禁止**回退成「只顯示最近 N 筆」或於客戶端推算；顯示格式化共用 `shared/utils/practice-history-format.ts`
- 出題跨請求去重素材（2026-10-01）: `exercise/services/practice-history-service.ts` 的 `getRecentQuestionPromptsForGeneration`／`getRecentListeningDialoguesForGeneration`（資料源：`PracticeRepo.listRecentQuestionPrompts`／`listRecentListeningDialogues`，近 14 日、DB 端去重、有上限）— 所有生成入口的唯一素材來源；**禁止**各入口自行查詢或自行截斷
- 證據規則單一定義（SQL 與 TS 共用）: `exercise/services/practice-evidence-rules.ts` — `PRACTICE_EVIDENCE_RULES` 同時供 `evaluatePracticeEvidence()`（TS）與 `practice-repo.evidenceRulesSql()`（SQL predicate）；**禁止**任一邊手寫 literals（source-scan 測試強制）
- 伺服器端證據聚合（SQL）: `exercise/repositories/practice-repo.ts` — `aggregateVerifiedTotalsForStudent()` / `...BySkillForStudent()` / `...ForStudentsByIds()`；必須重現場次層級 all-or-nothing（**不可**逐列 `WHERE`）
- egress 量測與等價性閘門: `scripts/diagnose-db-egress.ts`、`scripts/verify-evidence-sql-equivalence.ts`、`scripts/verify-activity-metrics-parity.ts`（部署閘門 0 差異）、`scripts/db-query-stats.ts`、`scripts/profile-requests.ps1`
- 累積指標投影與週界線（準確率／週快照）: `student/state/StudentStateMutationService.ts` — `collectVerifiedActivities()` + `syncActivityMetrics()`；無可驗證證據 ⇒ `overallAccuracy = null`（**永不寫 0**；`User.overallAccuracy` 無 DB default）；週界線用 `hkWeekStartMondayUtc()`。**2026-09-26（ADR-046）**：全歷史改走 SQL 聚合（只回傳數字）、本週為 `since = 香港週一` 的**有界抓取**；**失敗一律往上拋（fail-closed）——永不 catch-to-empty**，否則短暫 DB 故障會靜默覆蓋正確的準確率
- 批次累積投影（多學生，匯出／班級統計）: `exercise/services/practice-history-service.ts` — `aggregateVerifiedTotalsForStudents()`（**單一 SQL 聚合、每名學生一列**；**永不**以 `take: N` 當總數、亦不逐列搬全歷史）；連續天數批次版見 `student/progress/services/streak-service.ts` `getPracticeStreaksForStudents()`
- 提交權威解析（客戶端標記不可信）: `exercise/services/practice-authority-resolution.ts` — `questionId` 全部解析為同一正典家族（`ReadingQuestion`／`GrammarQuestion`）⇒ 該家族為權威；部分／混合／解析不到 ⇒ 回退既有 client-marker 分類（舊資料零行為改變）
- 活躍狀態門檻（未開始／失聯／低活躍／活躍）: `teacher/monitoring/services/activity-service.ts` — `classifyActivityStatus()`（香港日界線；活動來源＝登入 ∪ 練習 ∪ 寫作草稿 ∪ 作業提交）；`getShortWritingCounts()` 為 DB 端計數（in-memory fail-open 回退）
- 教師主頁班級數據（各班完成次數／參與人數／參與率／正確率；2026-10-01）: `teacher/monitoring/services/class-stats-service.ts` — 全校（排除 Demo）每班一列；累積走 `aggregateVerifiedTotalsForStudents()`（每生一列，**禁止**「最新 N 筆」）；名單＝`User.classId` ∪ `StudentClass`；無證據 ⇒ `accuracy = null`；入口 `GET /api/teacher/class-stats`（教師＋管理員；**只含聚合數字、無學生層級資料**）；UI 端**禁止**再以 `slice(0, N)`／作業完成率自行拼圖
- 診斷評分與自評邊界（Diagnostic Scoring Authority）: `assessment/services/diagnostic-scoring-service.ts` — 可評分題組（文法／閱讀／聆聽）經正典 `submitPractice` 評分＋持久化（可驗證證據）；詞彙／寫作在 evidence 契約無權威評分法 → 永久標示自評、不計入準確率
- AI Execution: `ai/services/ai-execution.ts`
- XP 事件政策（白名單＋伺服器去重鍵）: `student/progress/services/xp-event-policy.ts` — 唯一的事件白名單與去重鍵來源；`POST /api/gamification` 永不採信客戶端 `idempotencyKey`／`streakDays`／`difficulty`；鍵按 `studentId` 界定（全庫唯一索引）。數值表：`student/progress/services/gamification.ts`
- XP 難度與身分解析（伺服器權威）: `exercise/services/question-difficulty-resolution.ts` — `resolveAnswerXpIdentity()` 由 `questionId` 查正典題目（Grammar／Reading／Listening）：難度（只有 `GrammarQuestion` 有 difficulty；其餘 `core`）＋**內容指紋**（sha256；對選項洗牌／重新生成的新 id 穩定，供 answer XP 去重鍵）；查無此題 ⇒ null（呼叫端拒絕發 XP）、查詢故障 ⇒ 拋出
- Answer Verification (生成題目答案鍵覆核，交付前把關): `ai/services/answer-verification.ts` — 決定性缺陷螢幕（補位選項／重複選項／解說自認有誤）＋ 第二次獨立 LLM pass **blind-solve**；驗證器**永不**看到答案鍵；只有 `soundness === 'ok'` 且 blind 答案等於答案鍵才可交付（prompt: `ai/prompts/grammar/answer-verification.ts`，PromptRegistry `GenerateQuestionsAnswerVerification`）。**2026-09-27（覆核 v2）**：轉換題（轉述句等）必須有**單一選項同時滿足解說列出的全部轉換**，否則判 `flawed` 丟棄；禁止挑「最接近」的半對選項（實例：`we had to` 曾以半對選項被當成正解交付，學生選 `they must` 被誤判錯）
- Listening Question Store (聆聽題庫與交付判準): `listening/services/listening-question-service.ts` — 交付前持久化 `ListeningQuestion`（含對話）；`isDeliverableListeningMc()` 為唯一交付判準（MC + 對話非空 + 答案**逐字**出現在對話中，詞邊界比對）；全數不可交付 ⇒ 結構化 422 `LISTENING_QUESTIONS_NOT_DELIVERABLE`
- Listening Answer Scoring (聆聽評分權威): `listening/services/listening-answer-scoring.ts` — `listening-server-exact-match`；忽略所有客戶端評分欄位；委派正典 `scorePracticeAnswer()`；解析不到／marks 無效／開放式題型 ⇒ NOT_PROJECTABLE（不部分計分）
- Adaptive Learning: `learning/services/adaptive-learning-pipeline.ts`
- Learning Decisions: `learning/decisions/LearningDecisionEngine`
- Student Mastery: `student/mastery/`
- Curriculum: `curriculum/`
- Prompts: `ai/prompts/prompt-registry.ts`
- Providers: `ai/providers/provider-registry.ts`
- Circuit Breaker: `ai/runtime/circuit-breaker.ts`
- AI Budget Limits (額度上限): `ai/runtime/budget-policy.ts` — limits from `config.ai` (`AI_DAILY_TOKEN_LIMIT` / `AI_MONTHLY_COST_LIMIT`)
- AI Usage Ledger (用量帳本，跨 instance 共用): `ai/runtime/ai-usage-store.ts` + `AiDailyUsage` table
- Evaluation: `ai/evaluation/`
- Assessment: `ai/assessment/`
- Practice Storage: `modules/repositories.ts`
- Reading Diagnosis Verdict (閱讀診斷判決權威): `reading/feedback/reading-feedback-builder.ts` — `verdict` 只由評分器決定；規則式訊號（抄襲／詞形／語調／詞性）→ `qualityFlags` only
- Mistake Skill Identity (正典題目 → 技能／題型): `exercise/services/mistake-skill-identity.ts`
- Mistake Skill Breakdown / Strategy Cards: `mistake/intelligence/services/mistake-skill-breakdown.ts` + `mistake-strategy.ts`
- Mistake SRS Scheduling: `mistake/db/services/mistake-tracker.ts` (`nextMistakeReviewState`) + `mistake-repo.listDueMistakesForReview`
- Calibration Evidence Intake: `ai/calibration/intake-service.ts`
- Marker Pack / Adjudication: `ai/calibration/marking.ts`
- Dataset Freeze: `ai/calibration/freeze.ts`
- Prompt Versioning: `ai/prompt-versioning/prompt-registry.ts`
- Prompt Release: `ai/prompt-versioning/release-manager.ts`
- Regression Evaluation: `ai/regression/runner.ts`
- Experiment Platform: `ai/experiments/experiment-runner.ts`
- Continuous Evaluation: `ai/continuous-evaluation/monitor.ts`
