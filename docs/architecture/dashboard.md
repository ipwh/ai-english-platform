# Architecture Dashboard

**Generated**: 2026-07-23 | **Sprint**: 79 | **Version**: v6.0

---

## Module Graph (23 modules)

| Module | Files | Facade | Repositories |
|---|---|---|---|
| `ai/` | 49 | `ai/index.ts` | `material-repo.ts` |
| `learning/` | 41 | `learning/index.ts` | `memory-db-repo`, `learning-science-repo`, `memory-repo-interface` |
| `student/` | 25 | `student/index.ts` | `user-repo`, `student-repo`, `student-mastery-repo`, `progress-repo` |
| `knowledge-graph/` | 12 | — | `knowledge-graph-repo` |
| `teacher/` | 11 | — | — |
| `mistake/` | 11 | — | `mistake-repo`, `mistake-intelligence-repo` |
| `admin/` | 8 | — | `admin-class-repo`, `admin-misc-repo`, `admin-user-repo` |
| `adaptive-tutor/` | 8 | — | — |
| `vocabulary/` | 8 | — | `vocabulary-repo`, `vocabulary-intelligence-repo` |
| `writing-coach/` | 8 | — | `writing-draft-repo` |
| `curriculum/` | 6 | — | — |
| `ai-cost/` | 5 | — | — |
| `analytics/` | 5 | — | — |
| `assessment/` | 5 | — | `assessment-repo`, `diagnostic-repo` |
| `learning-analytics/` | 5 | — | — |
| `llm-eval/` | 5 | — | — |
| `cache/` | 4 | — | — |
| `exercise/` | 3 | — | `exercise-repo`, `practice-repo` |
| `experiment/` | 3 | — | — |
| `production/` | 2 | — | — |
| `notification/` | 1 | — | `notification-repo` |
| `platform/` | 1 | — | — |
| `__tests__/` | 1 | — | — |

---

## Repository Ownership Matrix

| Repository | Owner Module | Read Path | Write Path | External Consumers |
|---|---|---|---|---|
| `user-repo.ts` | `student/` | `StudentStateBuilder` | `StudentStateMutationService` | Admin sync |
| `student-mastery-repo.ts` | `student/mastery/` | `student-mastery-service` | `student-mastery-service` | `learning-analytics` (via Builder) |
| `progress-repo.ts` | `student/progress/` | `StudentStateBuilder` | `StudentStateMutationService` | — |
| `memory-db-repo.ts` | `learning/memory/` | `MemoryEngine` | `MemoryEngine` | `StudentStateBuilder` |
| `knowledge-graph-repo.ts` | `knowledge-graph/` | `knowledge-graph-service` | `knowledge-graph-service` | `learning/` facade |
| `mistake-repo.ts` | `mistake/db/` | `mistake-intelligence-repo` | `mistake-intelligence-repo` | — |
| `mistake-intelligence-repo.ts` | `mistake/intelligence/` | `mistake-intelligence-service` | `mistake-intelligence-service` | `learning/` facade |
| `exercise-repo.ts` | `exercise/` | Exercise routes | Exercise routes | `StudentStateBuilder` |
| `vocabulary-repo.ts` | `vocabulary/` | Vocabulary routes | Vocabulary routes | `StudentStateBuilder` |
| `writing-draft-repo.ts` | `writing-coach/` | Writing routes | Writing routes | `StudentStateBuilder` |
| `admin-*-repo.ts` | `admin/` | `admin-operations` | `admin-operations` | Admin routes only |

---

## Dependency Graph

```
Routes → Facades → Builders → Services → MutationService → Repositories → Prisma

  ai/ ──────┐
  learning/ ─┤─── knowledge-graph/
  student/ ──┤─── mistake/
  teacher/ ──┘─── vocabulary/
                 writing-coach/
                 admin/ (isolated)
                 cache/ (infrastructure)
```

---

## Architecture Score

| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Maintainability | 95 | 15% | 14.25 |
| Modularity | 100 | 20% | 20.00 |
| Dependency Hygiene | 100 | 20% | 20.00 |
| Test Coverage | 100 | 15% | 15.00 |
| Runtime Safety | 100 | 15% | 15.00 |
| Persistence | 100 | 5% | 5.00 |
| Governance | 100 | 5% | 5.00 |
| Documentation | 95 | 5% | 4.75 |
| **Total** | | | **99.00** |

---

## Governance Rules (48 enforced)

| Rule | Category |
|---|---|
| No circular dependencies | Import direction |
| AI ↛ Learning, Learning ↛ Teacher, Student ↛ Teacher | Import direction |
| Platform ↛ upper domains | Import direction |
| Facade exports (Student 5, Learning 5, AI 1) | Facade structure |
| Repositories in `repositories/` only | Repository isolation |
| Services ↛ external repos | Repository isolation |
| AI Isolation (no LLM in learning) | AI isolation |
| No `-v2` module suffixes | Version hygiene |
| Learning Science purity (algorithms only) | Domain purity |
| No duplicate mastery calculations | Duplicate logic |
| No duplicate knowledge graph | Duplicate logic |
| No duplicate recommendation engines | Duplicate logic |
| Route ≠ Prisma, Route ≠ Repo, Service ≠ Route | Layer enforcement |
| StudentStateBuilder only canonical read | Student runtime |
| MutationService only canonical write | Student runtime |
| Learning/analytics no Prisma/repos | Learning runtime |
| Cache only in `cache/` | Cache ownership |
| No singleton IO during import | Singleton safety |
| AI services ≤ 800 lines (whitelisted) | Service size |
| Provider code only in `providers/` | Provider isolation |
| Student ↛ Admin, Learning ↛ Admin | Import direction |
| Providers ↛ Student/Learning | Import direction |
| Prompts ↛ Services | Prompt isolation |
| Repositories ↛ Services | Layered architecture |

---

## Largest Files (Top 10)

| File | Lines | Status |
|---|---|---|
| `ai/services/ai-service.ts` | 2936 | ⚠️ Whitelisted |
| `writing-coach/services/writing-coach.ts` | 894 | ⚠️ Monitor |
| `experiment/services/experiment-engine.ts` | 750 | ⚠️ Whitelisted |
| `ai/services/rag-service.ts` | 653 | ⚠️ Monitor |
| `analytics/services/learning-analytics.ts` | 589 | ⚠️ Monitor |
| `ai/services/dse-topics.ts` | 582 | ⚠️ Data file |
| `knowledge-graph/services/knowledge-graph.ts` | 463 | OK |
| `writing-coach/services/writing-coach-formula.ts` | 418 | OK |
| `knowledge-graph/services/dependency-resolver.ts` | 392 | OK |
| `ai/services/dse-writing-data.ts` | 382 | ⚠️ Data file |

---

## Architecture History

| Milestone | Modules | Architecture Tests | Unit Tests | Score |
|---|---|---|---|---|
| v4 (Pre-Sprint 52) | 34 | 0 | 853 | — |
| v5 (Sprint 52-55) | 34 | 34 | 1027 | 95 |
| v5.5 (Sprint 69-72) | 23 | 35 | 980 | 98 |
| v6 (Sprint 73-78) | 23 | 48 | 982 | 99 |
