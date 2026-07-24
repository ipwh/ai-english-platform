# Codebase Statistics — Platform v1.0

**Generated**: 2026-07-24

## Overview

| Metric | Count |
|---|---|
| Modules | 22 |
| Service files | 111 |
| Repository files | 26 |
| Usecase files | 14 |
| Workflow definitions | 13 |
| Provider implementations | 5 |
| ADRs | 22 |
| Architecture tests | 113 |
| Total tests | 1,047 |
| API routes | 120+ |

## Module Breakdown

| Module | Files | Description |
|---|---|---|
| `ai` | 49 | Core AI: providers, pipeline, runtime, workflows, usecases, prompts, schemas |
| `learning` | 41 | Learning engine, memory, science, knowledge-graph bridge |
| `student` | 25 | Student profile, mastery, progress, gamification |
| `platform` | 20 | SRE, release, load-testing, benchmarks, health, events, plugins |
| `knowledge-graph` | 12 | Knowledge graph: dependency resolver, traversal, visualization |
| `teacher` | 11 | Teacher analytics, copilot |
| `mistake` | 11 | Mistake database, intelligence |
| `writing-coach` | 8 | Writing coach formulas, scoring |
| `vocabulary` | 8 | Vocabulary service, SRS, intelligence |
| `adaptive-tutor` | 8 | Adaptive explanations, hints, feedback |
| `admin` | 8 | Admin operations, user/class management |
| `curriculum` | 6 | Curriculum engine |
| `ai-cost` | 5 | Cost tracking |
| `llm-eval` | 5 | LLM evaluation |
| `analytics` | 5 | Analytics pro |
| `learning-analytics` | 5 | Learning analytics |
| `assessment` | 5 | Assessment + plagiarism |
| `cache` | 4 | TTL cache |
| `experiment` | 3 | Experiment engine |
| `exercise` | 3 | Exercise repository |
| `production` | 2 | Production readiness + feature flags |
| `notification` | 1 | Notification repo |

## Largest Service Files

| File | Lines |
|---|---|
| `writing-coach.ts` | 894 |
| `experiment-engine.ts` | 750 |
| `rag-service.ts` | 653 |
| `generate-questions.ts` (usecase) | 622 |
| `analyze-writing.ts` (usecase) | 542 |

## Architecture Evolution

| Sprint | Milestone | Key Metric |
|---|---|---|
| 69-72 | Domain Consolidation | 34→23 modules |
| 73-76 | CQRS Runtime | StudentStateBuilder + MutationService |
| 77-78 | AI Decomposition | Provider isolation |
| 79 | Quality Gates | Health checks |
| 80-82 | Use Case Extraction | Retry, context builder, parser |
| 83-84 | AI Pipeline + Governance | Pipeline, circuit breaker, budget |
| 85-86 | Platform Infrastructure | Event bus, plugin architecture |
| 87-90 | Workflow Engine | 13 workflows, stage library |
| 91-93 | Facade Slimming | 3,392→1,295→94 lines |
| 94 | Facade Finalization | 94-line pure facade |
| 95 | Architecture Freeze | Dead code removal |
| 96 | Production Readiness | Benchmarks, baselines, regressions |
| 97 | Scalability | Load testing, capacity, saturation |
| 98 | SRE | SLO, error budgets, runbooks, reliability |
| 99 | Release Governance | Feature flags, deployment validator, audit |
| **100** | **v1.0 Certification** | Architecture certified |
