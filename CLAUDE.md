# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek (primary) → Grok (fallback); Gemini Flash / Flash-Lite entries remain in the chain but their API key was retired 2026-08-20; Claude/OpenAI placeholders. **DeepSeek V4.1 thinking mode is opt-in** — the provider sends `thinking: {type:'disabled'}` unless the caller passes `thinking: true` (the API default ignores `temperature` and spends `max_tokens` on `reasoning_content`; see CHANGELOG 2026-09-15)
- **Testing**: Vitest 4, 3067 pass / 1 skipped (149 files passed, 1 skipped — fully green; dead adaptive-tutor, legacy writing-coach, teacher-analytics, teacher-decisions, analytics modules removed)
- **Build**: `node scripts/production-build.js` (exit 0) — 正式建構（`npm run build:prod`）；Vercel 已於 2026-09-15 移除，唯一部署目標為 Cloud Run
- **Key modules**: 21 under `src/modules/` (including 5 AI infra + foundation modules)
- **API routes**: 113 under `src/app/api/`
- **Architecture**: Facade→UseCase→Service→Repository→Prisma — single pipeline, single owner per responsibility
- **AI Pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. 11/13 use cases use canonical pipeline. `callLLM()` is re-exported by the facade for route-level raw-text calls (R3.10-L).
- **AI Facade**: 63 exported symbols (incl. types) — API routes use `@/modules/ai` (few documented exceptions: `rag` route uses vertex-embeddings, `reading` route uses prompt builders, `generate-model-essay` uses core modules). Answer verification adds `verifyGeneratedAnswers` / `inspectGeneratedQuestion` / `summarizeVerificationDrops`
- **Prompt Registry**: 13 prompts registered in `ai/prompts/prompt-registry.ts` — centralized discovery & versioning
- **AI Module**: 19 directories, 212 non-test TS files (includes Shared PromptOps Foundation, prompt-versioning, regression, experiments, continuous-evaluation, answer verification)
- **Shared PromptOps Foundation**: `src/modules/ai/foundation/` — BaseRegistry, VersionedRegistry, HistoryRegistry, BaseRunner, PipelineRunner, LifecycleEngine, ReportBuilder, EventBus, MetricsCollector, Repository/MemoryStore, Validator. 36 files, 0 external deps, strict PromptOps→Foundation dependency direction. 256 contract tests.
- **Runtime**: 7 files — circuit-breaker, budget-policy, ai-usage-store, capacity-planner, provider-policy, regression-detector, saturation-detector
- **Tooling**: `scripts/benchmark-ai.ts`, `scripts/load-test.ts`, `scripts/validate-prompts.ts`, `scripts/reliability-report.ts`, `scripts/prompt-version.ts`, `scripts/evaluate-regression.ts`, `scripts/experiment.ts`, `scripts/monitor.ts`, `scripts/set-academic-year.ts`, `scripts/unassign-non-roster.ts`
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
- **Debug**: `DEEPSEEK_DEBUG=true` for full API request/response logging

## Architecture (Post-Sprint 130 — Writing Evaluation Hardened, Production-Ready)
```
Routes (113) → AIFacade → UseCases (13) → executeAI / executeAIRaw / callLLM
                  ├─ Prompts (PromptRegistry + builders)
                  ├─ Providers (6-model chain + circuit-breaker)
                  ├─ Services (RAG, TTS, evaluator, enrichment)
                  └─ Schemas (Zod validation)

Writing Evaluation (Sprints 127-130):
  Semantic Evaluator (evidence-only) → CLO Evaluator (score authority) → Deterministic Normalization
    ├─ CLO_RUBRIC / CLO_RUBRIC_ZH → single source (writing-rubric.ts)
    ├─ Golden Benchmark Runner → MAE/RMSE/bias (golden-runner.ts)
    └─ RAG → reference context only (never scoring)

Question Generation — Pre-Delivery Answer Verification (2026-09-20, ADR-042):
  generateQuestions → normalize → validateAndFixQuestion → verifyGeneratedAnswers → retry if short
    ├─ Layer A (deterministic, zero cost): option count / duplicates / invalid key letter /
    │    fallback-filler option / explanation self-admits the item is defective
    ├─ Layer B (independent LLM pass, blind): verifier never sees the answer key;
    │    soundness ok | ambiguous | flawed + blind answer vs key
    └─ dropped items → retry with feedback (summarizeVerificationDrops); repair path also gated

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
- 累積練習投影（技能掌握度題數 / 每週摘要）: `exercise/services/practice-history-service.ts` — 日期界線 + 全歷史分頁 + 正典 `evaluatePracticeEvidence`；**永不**由「最新 N 筆」切片推算（會令累積數字下降）
- 累積指標投影與週界線（準確率／週快照）: `student/state/StudentStateMutationService.ts` — `collectVerifiedActivities()` + `syncActivityMetrics()`；無可驗證證據 ⇒ `overallAccuracy = null`（**永不寫 0**）；週界線用 `hkWeekStartMondayUtc()`
- 診斷評分與自評邊界（Diagnostic Scoring Authority）: `assessment/services/diagnostic-scoring-service.ts` — 可評分題組（文法／閱讀）經正典 `submitPractice` 評分＋持久化（可驗證證據）；聆聽／詞彙／寫作在 evidence 契約無權威評分法 → 永久標示自評、不計入準確率
- AI Execution: `ai/services/ai-execution.ts`
- Answer Verification (生成題目答案鍵覆核，交付前把關): `ai/services/answer-verification.ts` — 決定性缺陷螢幕（補位選項／重複選項／解說自認有誤）＋ 第二次獨立 LLM pass **blind-solve**；驗證器**永不**看到答案鍵；只有 `soundness === 'ok'` 且 blind 答案等於答案鍵才可交付（prompt: `ai/prompts/grammar/answer-verification.ts`，PromptRegistry `GenerateQuestionsAnswerVerification`）
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
