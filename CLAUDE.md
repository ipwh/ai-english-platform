# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek → Vertex Gemini → Gemini API → Grok → Claude → OpenAI (6-provider fallback chain)
- **Testing**: Vitest 4, 60/61 test files pass (1,586 tests, 74 files — 1 pre-existing file: `adaptive-tutor.test.ts`)
- **Build**: `node scripts/vercel-build.js` (exit 0)
- **Key modules**: 27 under `src/modules/` (including 4 new AI infra modules)
- **API routes**: 120 under `src/app/api/`
- **Architecture**: Facade→UseCase→Service→Repository→Prisma — single pipeline, single owner per responsibility
- **AI Pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. 11/13 use cases use canonical pipeline. `callLLM()` internal only.
- **AI Facade**: 32+ exported symbols — all API routes use `@/modules/ai` (no direct service imports)
- **Prompt Registry**: 12 prompts registered in `ai/prompts/prompt-registry.ts` — centralized discovery & versioning
- **AI Module**: 16 directories, ~200 files (expanded from 13/127 with new infra: prompt-versioning, regression, experiments, continuous-evaluation)
- **Runtime**: 6 files — circuit-breaker, budget-policy, capacity-planner, provider-policy, regression-detector, saturation-detector
- **Tooling**: `scripts/benchmark-ai.ts`, `scripts/load-test.ts`, `scripts/validate-prompts.ts`, `scripts/reliability-report.ts`, `scripts/prompt-version.ts`, `scripts/evaluate-regression.ts`, `scripts/experiment.ts`, `scripts/monitor.ts`
- **AI Infra CLI**: `npm run prompt:*` (list/history/diff/snapshot/changelog/release/states), `npm run evaluate:*`, `npm run prompt:experiment:*`, `npm run prompt:monitor:*`
- **Shared utilities**: `computeWeightedScore()`, `skillLabelZh()`, `memoryService`, `BaseRuleEngine`, `CLO_RUBRIC`
- **i18n**: ~710 keys, 17 module files, check: `node scripts/check-i18n.js`
- **Deployment Readiness**: 9.5/10 (v1.0 Production Ready — all audit items resolved, AI infra complete)
- **AI Quality**: DSE reading 8.2/10 — DeepSeek primary, 4-tier retry, JSON repair (7-step), paragraph ref verification
- **Layout**: v5 grid per-line (`.dse-line` + gutter + justify text); paragraph labels above; 2em indent
- **Debug**: `DEEPSEEK_DEBUG=true` for full API request/response logging

## Architecture (Post-Sprint 124 — AI Infrastructure Complete)
```
Routes (120) → AIFacade → UseCases (13) → executeAI / executeAIRaw / callLLM
                  ├─ Prompts (PromptRegistry + builders)
                  ├─ Providers (6-model chain + circuit-breaker)
                  ├─ Services (RAG, TTS, evaluator, enrichment)
                  └─ Schemas (Zod validation)

Supporting modules:
  student/ — mastery, profile (canonical owner)
  learning/ — decisions, pipeline (canonical owner)
  curriculum/ — HKDSE data (canonical owner)
  adaptive-tutor/ — AdaptiveTutorEngine (canonical owner)

AI Infrastructure (new in Sprint 122-124):
  ai/prompt-versioning/ — PromptVersionRegistry, SemVer, lifecycle (7 states), release management, diff, changelog, snapshots
  ai/regression/ — RegressionRunner, rubric/semantic/structural scoring, golden fixtures, evaluation reports
  ai/experiments/ — ExperimentRunner (A/B/C, cross-provider/version/temperature/dataset/seed), statistics engine, winner selection, confidence scoring
  ai/continuous-evaluation/ — Monitor (scheduled eval), drift detector (8 dims), regression monitor, provider monitor, quality trends, alert engine, baseline manager

Dev tooling:
  scripts/benchmark-ai.ts, load-test.ts, validate-prompts.ts, reliability-report.ts
  scripts/prompt-version.ts (version management CLI)
  scripts/evaluate-regression.ts (regression evaluation CLI)
  scripts/experiment.ts (A/B experiment CLI)
  scripts/monitor.ts (continuous evaluation CLI)
  .github/workflows/regression.yml, experiment.yml, continuous-evaluation.yml
  ai/benchmark/ — benchmark framework (used by CLI)
  ai/evaluation/ — EvaluationEngine (used by SRE dashboard)
  ai/assessment/ — AssessmentEngine (used by SRE dashboard)
```

## Ownership (Single Owner per Responsibility)
- AI Execution: `ai/services/ai-execution.ts`
- Adaptive Learning: `adaptive-tutor/AdaptiveTutorEngine`
- Learning Decisions: `learning/decisions/LearningDecisionEngine`
- Student Mastery: `student/mastery/`
- Curriculum: `curriculum/`
- Prompts: `ai/prompts/prompt-registry.ts`
- Providers: `ai/providers/provider-registry.ts`
- Circuit Breaker: `ai/runtime/circuit-breaker.ts`
- Evaluation: `ai/evaluation/`
- Assessment: `ai/assessment/`
- Practice Storage: `modules/repositories.ts`
- Prompt Versioning: `ai/prompt-versioning/prompt-registry.ts`
- Prompt Release: `ai/prompt-versioning/release-manager.ts`
- Regression Evaluation: `ai/regression/runner.ts`
- Experiment Platform: `ai/experiments/experiment-runner.ts`
- Continuous Evaluation: `ai/continuous-evaluation/monitor.ts`
