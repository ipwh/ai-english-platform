# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek → Gemini Flash → Gemini Flash-Lite → Grok (4 active; Claude/OpenAI placeholders)
- **Testing**: Vitest 4, 2877/2877 tests pass (130 files, 1 skipped — fully green; dead adaptive-tutor + legacy writing-coach modules removed)
- **Build**: `node scripts/vercel-build.js` (exit 0)
- **Key modules**: 22 under `src/modules/` (including 5 AI infra + foundation modules)
- **API routes**: 119 under `src/app/api/`
- **Architecture**: Facade→UseCase→Service→Repository→Prisma — single pipeline, single owner per responsibility
- **AI Pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. 11/13 use cases use canonical pipeline. `callLLM()` is re-exported by the facade for route-level raw-text calls (R3.10-L).
- **AI Facade**: 61 exported symbols — API routes use `@/modules/ai` (few documented exceptions: `rag` route uses vertex-embeddings, `reading` route uses prompt builders, `generate-model-essay` uses core modules)
- **Prompt Registry**: 12 prompts registered in `ai/prompts/prompt-registry.ts` — centralized discovery & versioning
- **AI Module**: 19 directories, 209 non-test TS files (includes Shared PromptOps Foundation, prompt-versioning, regression, experiments, continuous-evaluation)
- **Shared PromptOps Foundation**: `src/modules/ai/foundation/` — BaseRegistry, VersionedRegistry, HistoryRegistry, BaseRunner, PipelineRunner, LifecycleEngine, ReportBuilder, EventBus, MetricsCollector, Repository/MemoryStore, Validator. 36 files, 0 external deps, strict PromptOps→Foundation dependency direction. 256 contract tests.
- **Runtime**: 6 files — circuit-breaker, budget-policy, capacity-planner, provider-policy, regression-detector, saturation-detector
- **Tooling**: `scripts/benchmark-ai.ts`, `scripts/load-test.ts`, `scripts/validate-prompts.ts`, `scripts/reliability-report.ts`, `scripts/prompt-version.ts`, `scripts/evaluate-regression.ts`, `scripts/experiment.ts`, `scripts/monitor.ts`
- **AI Infra CLI**: `npm run prompt:*` (list/history/diff/snapshot/changelog/release/states), `npm run evaluate:*`, `npm run prompt:experiment:*`, `npm run prompt:monitor:*`, `npm run calibration:*` (ingest/report/intake/verify/marker-pack/marker-intake/adjudicate/freeze)
- **Shared utilities**: `computeWeightedScore()`, `skillLabelZh()`, `memoryService`, `BaseRuleEngine`, `CLO_RUBRIC`, `CLO_RUBRIC_ZH`
- **i18n**: 18 module files, 1655 unique keys, check: `node scripts/check-i18n.js` (exit 0 = no hardcoded Chinese)
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
- **Golden Benchmark**: 5 fixtures in `evaluation/fixtures/writing-golden/`, runner in `evaluation/golden-runner.ts` (MAE/RMSE/bias), 0 human-labelled (awaiting calibration)
- **Continuous Evaluation Durability**: EvaluationStore (MemoryStore/Repository), crash recovery with at-least-once replay + idempotent side effects, generation-scoped exactly-once, metrics dedup, terminal-state immutability, recovery serialization, 165+ CE integration tests
- **Layout**: v5 grid per-line (`.dse-line` + gutter + justify text); paragraph labels above; 2em indent
- **Debug**: `DEEPSEEK_DEBUG=true` for full API request/response logging

## Architecture (Post-Sprint 130 — Writing Evaluation Hardened, Production-Ready)
```
Routes (119) → AIFacade → UseCases (13) → executeAI / executeAIRaw / callLLM
                  ├─ Prompts (PromptRegistry + builders)
                  ├─ Providers (6-model chain + circuit-breaker)
                  ├─ Services (RAG, TTS, evaluator, enrichment)
                  └─ Schemas (Zod validation)

Writing Evaluation (Sprints 127-130):
  Semantic Evaluator (evidence-only) → CLO Evaluator (score authority) → Deterministic Normalization
    ├─ CLO_RUBRIC / CLO_RUBRIC_ZH → single source (writing-rubric.ts)
    ├─ Golden Benchmark Runner → MAE/RMSE/bias (golden-runner.ts)
    └─ RAG → reference context only (never scoring)

Supporting modules:
  student/ — mastery, profile (canonical owner)
  learning/ — decisions, pipeline (canonical owner)
  curriculum/ — HKDSE data (canonical owner)

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
- AI Execution: `ai/services/ai-execution.ts`
- Adaptive Learning: `learning/services/adaptive-learning-pipeline.ts`
- Learning Decisions: `learning/decisions/LearningDecisionEngine`
- Student Mastery: `student/mastery/`
- Curriculum: `curriculum/`
- Prompts: `ai/prompts/prompt-registry.ts`
- Providers: `ai/providers/provider-registry.ts`
- Circuit Breaker: `ai/runtime/circuit-breaker.ts`
- Evaluation: `ai/evaluation/`
- Assessment: `ai/assessment/`
- Practice Storage: `modules/repositories.ts`
- Calibration Evidence Intake: `ai/calibration/intake-service.ts`
- Marker Pack / Adjudication: `ai/calibration/marking.ts`
- Dataset Freeze: `ai/calibration/freeze.ts`
- Prompt Versioning: `ai/prompt-versioning/prompt-registry.ts`
- Prompt Release: `ai/prompt-versioning/release-manager.ts`
- Regression Evaluation: `ai/regression/runner.ts`
- Experiment Platform: `ai/experiments/experiment-runner.ts`
- Continuous Evaluation: `ai/continuous-evaluation/monitor.ts`
