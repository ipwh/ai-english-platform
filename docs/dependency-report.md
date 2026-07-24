# Dependency Report — Platform v1.0

**Generated**: 2026-07-24

## Module Dependency Graph

```
student ────────┐
vocabulary ─────┤
                ├── learning ── knowledge-graph ── curriculum ── mistake
                │
assessment ─────┤
writing-coach ──┤
adaptive-tutor ─┤
                │
ai ─────────────┤ (providers, pipeline, runtime, workflows, usecases)
ai-cost ────────┤
llm-eval ───────┤
                │
cache ──────────┤
production ─────┤
experiment ─────┤
notification ───┤
platform ───────┤ (SRE, release, load-testing, benchmarks, dashboard)
                │
analytics ──────┤
learning-analytics ┘

admin ── teacher (isolated)
```

## Circular Dependencies

**0 detected.** Enforced by architecture tests.

## Shared Service Ownership

| Service | Owner | Consumers |
|---|---|---|
| `runtime-metrics` | `ai/services` | SRE, release, dashboard, benchmarks, load-testing |
| `llm-call` | `ai/services` | All 13 usecases |
| `json-utils` | `ai/services` | All LLM-based usecases |
| `question-validator` | `ai/services` | ai-service facade, question-normalizer |
| `saturation-detector` | `ai/runtime` | SRE reliability-score, deployment-validator |
| `capacity-planner` | `ai/runtime` | SRE, release-validator |
| `regression-detector` | `ai/runtime` | SRE reliability-score, deployment-validator |
| `slo-manager` | `platform/sre` | Deployment-validator, dashboard |
| `error-budget` | `platform/sre` | Deployment-validator, dashboard |
| `reliability-score` | `platform/sre` | Dashboard, certification |

## Duplicate Detection

**0 duplicates found.** All helpers have single canonical owners.

## Largest Modules by Service Files

| Module | Services |
|---|---|
| `ai` | 18 |
| `learning` | 16 |
| `knowledge-graph` | 12 |
| `platform` | 20 |
| `writing-coach` | 5 |
