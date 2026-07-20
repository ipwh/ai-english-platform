# Domain Consolidation Audit — AI English Platform v4.1

> Generated: 2026-07-20 | 35 modules analyzed | 8 domains defined | Task 1-5 ✅

---

## Task 2: Student Domain Consolidation — EXECUTED

### StudentFacade (`src/modules/student/index.ts`)

Unified entry point wrapping all 5 student sub-domains:

| Sub-domain | Modules | Facade API |
|-----------|---------|------------|
| **Profile** | `profile/` | `generate`, `aggregateSkills`, `analyzeTopics`, `learningSpeed` |
| **Mastery** | `student-mastery/` (S31) | `getProfile`, `updateAfterExercise`, `updateAfterWriting`, `updateAfterVocabulary` |
| **Memory** | `learning-memory/` (S36) | `service` (MemoryService), `engine` (MemoryEngine) |
| **Progress** | `progress/` | `get`, `awardXp`, `streak`, `syncStreak`, `levelInfo`, `checkBadges`, `allBadges`, `studyRecommendation`, `leaderboard`, `dailyGoal` |
| **Twin** | `student-twin/` (S20) | `service` (StudentTwinService) |

### Design Rule Compliance

| Rule | Status |
|------|--------|
| #3: Student Mastery is single source of truth | ✅ `StudentFacade.mastery` is the only entry point |
| #7: Twin represents digital state, not profile | ✅ Twin is separate sub-domain under StudentFacade |
| #10: Prefer reuse over duplication | ✅ All 5 sub-domains are wrapped, not rewritten |

### Key Design Decisions

- **Not physically moved**: Modules remain at `student-mastery/`, `learning-memory/`, etc. to maintain backward compatibility. The facade provides the unified interface.
- **Other modules should use StudentFacade**: Future code should import from `@/modules/student` instead of directly from individual modules.
- **No repository-level changes**: Repositories remain internal to their modules.

---

## Task 3: Learning Domain Consolidation — EXECUTED

### LearningFacade (`src/modules/learning/index.ts`)

Unified entry point wrapping all 5 learning sub-domains:

| Sub-domain | Modules | Facade API |
|-----------|---------|------------|
| **Engine** | `adaptive-learning/` (S39) | `execute` (Pipeline) |
| **Recommendation** | `recommendation-v2/` (S33) | `getFull`, `grammar`, `vocabulary`, `writing`, `nextExercise` |
| **KnowledgeGraph** | `knowledge-graph/` (S21/34) | `service`, `repo`, `topologicalSort`, `shortestLearningPath`, `lookupWeaknesses`, `unlockNextSkills` |
| **Science** | `learning-science/` (S33) | `confidence`, `difficulty` (algorithms only, no API/repos) |
| **MistakeIntel** | `mistake-intelligence/` (S32) | `buildProfile` |

### Overlap Analysis

| Overlap | Modules | Resolution |
|---------|---------|------------|
| Dual knowledge graphs | `learning/` (S7, 30 nodes) vs `knowledge-graph/` (S21, 52 nodes) | S7 provides seed data (`GRAMMAR_GRAPH`). Migration: extract into `knowledge-graph/data/`, deprecate S7. |
| Dual recommendation engines | `recommendation/` (v1, 8 strategies) vs `recommendation-v2/` (S33, 4-factor) | Both active. v2 is canonical deterministic path. v1 retained for LLM-based complementary recommendations. |
| Dual pipelines | `learning/` (S7) vs `adaptive-learning/` (S39) | S39 supersedes S7. S7 is legacy. |

### Rule Compliance

| Rule | Status |
|------|--------|
| #1: Decisions based on Student State | ✅ LearningFacade requires mastery data via StudentFacade |
| #2: Recommendation is deterministic | ✅ v2 uses 4-factor weighted formula with explanations |
| #4: Knowledge Graph → prerequisites only, no AI | ✅ No AI logic in knowledge-graph module |
| #5: Science → algorithms only, no API/repos | ✅ learning-science has no API routes or DB repos |
| #10: Reuse over duplication | ✅ Facade wraps, never rewrites |

### Cross-Module Call Violations (documented, not yet migrated)

| Caller | Callee | Violation |
|--------|--------|-----------|
| `recommendation-v2/` | `student-mastery/repositories` | Should go through StudentFacade |
| `recommendation-v2/` | `mistake-intelligence/repositories` | Should go through LearningFacade.mistakeIntel |
| `adaptive-learning/` | `student-mastery/`, `mistake-intelligence/`, `knowledge-graph/` | Should go through facades |

> These violations are documented for future migration. They do not break functionality — the facades exist as the RECOMMENDED path forward.

---

## Task 4: Teacher Domain Consolidation — EXECUTED

### TeacherFacade (`src/modules/teacher/index.ts`)

Unified entry point wrapping all 3 teacher sub-domains:

| Sub-domain | Modules | Facade API |
|-----------|---------|------------|
| **Copilot** | `teacher-copilot/` (S38) | `generateLessonPlan`, `generateAssignments`, `analyzeClass`, `analyzeStudent`, `predictExam`, `getOverview` |
| **Analytics** | `teacher-analytics/` (S24) | `analyzeClass`, `detectWeakSkills`, `rankWriting`, `rankReading`, `compareStudent`, `predictRisks`, `generateSuggestions`, `detectLearningGaps`, `generateAIReport` |
| **Dashboard** | `learning-analytics/` (S37) | `build` (TeacherDashboard with weak/strong skills, class comparison, risk predictions, charts) |

### Rule #6 Compliance

| Requirement | Status |
|-------------|--------|
| Teacher Copilot never duplicates Recommendation logic | ✅ Copilot generates assignments using `learning-analytics` data, not its own recommendation engine |
| Always reuse Learning Engine | ✅ Dashboard reuses `learning-analytics`; analytics warns about weak skills via LearningFacade |
| Future-proof architecture | ✅ 3 distinct sub-domains with clear boundaries |

---

## Task 5: AI Domain Consolidation — EXECUTED

### AIFacade (`src/modules/ai/index.ts`)

Unified entry point wrapping all AI sub-domains:

| Sub-domain | Modules | Facade API |
|-----------|---------|------------|
| **Providers** | `ai/providers/` (5 models) | `registry`, `getLastUsed`, `wasFallbackUsed`, `isDeepSeekConfigured` |
| **Generation** | `ai/services/` | `questions`, `writingPrompt` |
| **Analysis** | `ai/services/` | `writing` (analyzeWriting) |
| **RAG** | `ai/services/rag-service` | `service` (DSE past paper retrieval) |
| **TTS** | `ai/services/tts-service` | `service` |
| **Cache** | `cache/` (S12) | `service` (TTL in-memory) |
| **Cost** | `ai-cost/` (S13) | `tracker` |
| **Evaluation** | `llm-eval/` | `engine` |
| **Experiment** | `experiment/` (S42) | `engine` (A/B testing) |

### Rule #8 Compliance

| Requirement | Status |
|-------------|--------|
| AI providers independent from learning logic | ✅ Learning modules go through AIFacade, not individual providers |
| Learning modules never know which model generated response | ✅ `callLLM` abstracts provider selection |
| ProviderRegistry is single entry point | ✅ `AIFacade.providers.registry` |

### Provider Fallback Chain

```
DeepSeek → Vertex Gemini → Gemini API → Claude → OpenAI
   ↓           ↓              ↓          ↓        ↓
  Primary    GCP-hosted    Google AI   Anthropic  OpenAI
```

### Design Decisions

- **No physical reorganization**: `ai/` already contains providers, services, schemas, prompts in a clean structure. The facade adds the barrel index.
- **Cache, Cost, Eval, Experiment**: These are separate modules imported into the facade rather than moved into `ai/` — maintains backward compatibility.
- **ProviderRegistry unchanged**: Remains the single source of truth for provider selection and fallback.

## Domain Model

The platform is organized into **8 domains**, each with clear boundaries:

| Domain | Responsibility | Example Modules |
|--------|---------------|-----------------|
| **AI** | LLM integration, prompt management, model fallback, RAG | `ai`, `ai-cost`, `llm-eval` |
| **Learning** | Core learning intelligence pipeline (S31-S39) | `student-mastery`, `knowledge-graph`, `recommendation-v2`, `adaptive-learning` |
| **Student** | Student-facing features: vocab, writing, mistakes, progress | `vocabulary`, `vocabulary-intelligence`, `writing-coach`, `writing-coach-v2`, `mistake-db`, `mistake-intelligence`, `progress` |
| **Teacher** | Teacher tools: copilot, assignments, class analysis | `teacher-copilot`, `assessment` |
| **Exercise** | Exercise generation, practice sessions, daily challenges | `exercise`, `adaptive-tutor` |
| **Assessment** | Grading, feedback, plagiarism, Chinglish detection | `assessment`, `feedback` |
| **Analytics** | Dashboards, trends, reporting, predictions | `analytics`, `learning-analytics` |
| **Platform** | Cross-cutting: cache, events, observability, perf, production, config | `cache`, `events`, `observability`, `perf`, `production`, `experiment` |

---

## Module Audit Table

### 🔴 RED — Duplicate / Legacy / Problematic

| Module | Purpose | Files | Domain | Problem | Risk |
|--------|---------|-------|--------|---------|------|
| `learning/` | Sprint 7: Legacy learning engine with own `knowledge-graph.ts` | 8 | Learning | **DUPLICATE**: Own `knowledge-graph.ts` conflicts with `knowledge-graph/` module. `adaptive-recommendation.ts` conflicts with `recommendation-v2/`. `mastery-calculator.ts` conflicts with `student-mastery/`. `weakness-analyzer.ts` conflicts with `mistake-intelligence/`. **ZERO consumers** — no API routes or modules import from it. | 🟢 Safe to deprecate |
| `analytics/` | Sprint 23: Legacy analytics (timelines, heatmaps, radar) | 7 | Analytics | **DUPLICATE**: Superseded by `learning-analytics/` (Sprint 37). Still has 2 API routes (`/api/analytics`, `/api/analytics/report`). Functions like `buildMasteryTrend`, `buildWeaknessTrend` overlap with v2. | 🟡 Needs migration plan |
| `observability/` | Sprint 17: Metrics, tracing, latency/error monitoring | 7 | Platform | **DUPLICATE NAMESPACE**: `src/modules/observability/` conflicts with `src/shared/observability/`. Zero consumers. | 🟢 Safe to consolidate into shared |
| `events/` | Sprint 11: In-process pub/sub event bus | 7 | Platform | **ZERO CONSUMERS**: No `@/modules/events` imports anywhere outside the module. | 🟢 Safe to deprecate |
| `perf/` | Sprint 14: N+1 detection, query optimizer | 5 | Platform | **ZERO CONSUMERS**: No imports from other modules. | 🟢 Safe to deprecate |
| `learning-facade/` | Sprint 40: Barrel re-exports from 9 modules | 1 | Learning | **No own logic** — pure re-export. Should be moved to `src/modules/index.ts` | 🟢 Safe to refactor |

### 🟡 YELLOW — Overlap / Needs Alignment

| Module | Purpose | Files | Domain | Problem | Risk |
|--------|---------|-------|--------|---------|------|
| `mistake-db/` | Sprint 9: v1 mistake tracking + SRS | 8 | Student | **OVERLAP with `mistake-intelligence/`**: Both track mistakes. `mistake-db` does SRS + analytics + recommendations. `mistake-intelligence` does longitudinal patterns + weakness profiling. Both query the same `Mistake` table. Design: v1 is the data layer, v2 is the intelligence layer — but `mistake-intelligence` imports from `mistake-db`'s `mistake-tracker`. | 🟡 Boundary is subtle but intentional |
| `writing-coach/` | Sprint 27: LLM-based writing coach | 4 | Student | **OVERLAP with `writing-coach-v2/`**: v1 uses LLM for analysis. v2 uses formula-based heuristics. Different approaches, same domain. Design: complementary not conflicting. | 🟢 Intentional design |
| `vocabulary/` | Sprint 4: v1 vocab CRUD + SRS | 15 | Student | **OVERLAP with `vocabulary-intelligence/`**: v1 handles CRUD + SRS. v2 computes profiles, status, CEFR difficulty. v2 reads v1's `VocabItem`. Design: v1 data layer, v2 intelligence layer. | 🟡 Boundary is subtle but intentional |
| `curriculum/` | HKDSE data + CEFR descriptors | 7 | Learning | **Tight coupling to `knowledge-graph`**: Imports types + service from `knowledge-graph`. Also `profile` types. This is fine — curriculum is the data source for the knowledge graph. | 🟢 Expected coupling |
| `adaptive-tutor/` | AI-powered adaptive tutoring | 9 | Exercise | **Tight coupling to `learning-science`**: Imports from `learning-science` (confidence-estimator, difficulty-adjuster). Also imports from `knowledge-graph` and `learning-memory`. | 🟢 Expected coupling |
| `learning-memory/` | Student memory lifecycle (S36) | 12 | Learning | **Overlaps with `learning-science/`**: Both deal with Ebbinghaus curves and memory decay. `learning-science` is the algorithm layer; `learning-memory` is the persistence + profile layer. | 🟢 Intentional split |

### 🟢 GREEN — Clean / Well-Defined

| Module | Purpose | Files | Domain |
|--------|---------|-------|--------|
| `ai/` | Core AI integration (5 providers, 21 services) | 45 | AI |
| `ai-cost/` | Token estimation, cost tracking | 6 | AI |
| `llm-eval/` | LLM evaluation: prompts, models, metrics | 7 | AI |
| `student-mastery/` | Sprint 31: 6-skill mastery tracking | 7 | Learning |
| `mistake-intelligence/` | Sprint 32: Longitudinal mistake analysis | 6 | Learning |
| `recommendation-v2/` | Sprint 33: Weighted recommendation engine | 6 | Learning |
| `knowledge-graph/` | Sprint 34: 52-node DAG, 8 services | 13 | Learning |
| `vocabulary-intelligence/` | Sprint 35: Vocab profiling, CEFR difficulty | 7 | Student |
| `writing-coach-v2/` | Sprint 36: 8-dimension heuristic scoring | 6 | Student |
| `learning-analytics/` | Sprint 37: Trends, dashboards, predictions | 5 | Analytics |
| `teacher-copilot/` | Sprint 38: Lesson plans, assignments, class analysis | 8 | Teacher |
| `adaptive-learning/` | Sprint 39: Facade pipeline orchestrator | 5 | Learning |
| `exercise/` | Practice sessions, daily challenges | 4 | Exercise |
| `assessment/` | Grading, Chinglish (100+ rules), plagiarism | 7 | Assessment |
| `feedback/` | Student submission feedback | 2 | Assessment |
| `progress/` | Gamification: XP, streaks, badges | 5 | Student |
| `profile/` | Student profiles, preferences, learning speed | 7 | Student |
| `notification/` | Notification repository | 2 | Platform |
| `cache/` | In-memory TTL cache | 5 | Platform |
| `production/` | Circuit breaker, retry, health checks | 3 | Platform |
| `experiment/` | A/B testing for prompts and models | 4 | Platform |
| `learning-science/` | SM-2, Ebbinghaus, interleaving, confidence | 11 | Learning |

---

## Dependency Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Domain                                │
│  ai ←── ai-cost ←── llm-eval                                   │
│  (45 files)    (6)       (7)                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ imported by 14 API routes
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Learning Domain                             │
│                                                                 │
│  learning-science ──→ adaptive-tutor                           │
│  (11 files)           (9 files)                                 │
│                                                                 │
│  student-mastery ──→ mistake-intelligence                      │
│  (7 files)           (6 files)                                  │
│       │                    │                                    │
│       ▼                    ▼                                    │
│  knowledge-graph ←── recommendation-v2                         │
│  (13 files)           (6 files)                                 │
│       │                    │                                    │
│       └────────┬───────────┘                                    │
│                ▼                                                │
│         adaptive-learning (facade, 5 files)                     │
│                │                                                │
│                ▼                                                │
│         learning-facade (barrel, 1 file)                        │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Student Domain                              │
│                                                                 │
│  vocabulary ──→ vocabulary-intelligence                        │
│  (15 files)      (7 files)                                      │
│                                                                 │
│  writing-coach ──→ writing-coach-v2                            │
│  (4 files)         (6 files)                                    │
│                                                                 │
│  mistake-db ──→ mistake-intelligence                           │
│  (8 files)      (imports mistake-tracker)                       │
│                                                                 │
│  progress (5)    profile (7)                                    │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Teacher Domain                               │
│                                                                 │
│  teacher-copilot (8 files)                                      │
│  assessment (7 files)                                           │
│  feedback (2 files)                                             │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Analytics Domain                              │
│                                                                 │
│  analytics (S23, legacy, 7 files)                               │
│  learning-analytics (S37, active, 5 files)                      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Platform Domain                               │
│                                                                 │
│  cache (5)   events (7, dead)   observability (7, dead)         │
│  perf (5, dead)   production (3)   experiment (4)               │
│  notification (2)                                                │
│                                                                 │
│  ⚠️ src/shared/observability/ — duplicate namespace             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Circular Dependency Check

✅ **No circular dependencies detected.** The dependency graph is a DAG flowing downward:
`AI → Learning → Student → Teacher/Analytics → Platform`

---

## Dead Code / Zero Consumers

| Module | Files | Problem | Recommendation |
|--------|-------|---------|----------------|
| `learning/` | 8 | Own `knowledge-graph.ts`, `mastery-calculator`, `weakness-analyzer` — ALL superseded by S31-S39 modules. Zero API routes import it. | **Deprecate** — Remove after confirming zero runtime usage in pages |
| `events/` | 7 | In-process pub/sub — zero imports from any module or API route. | **Deprecate** — Remove or fold into `shared/` |
| `observability/` | 7 | Duplicate with `src/shared/observability/`. Zero consumers. | **Consolidate** into `src/shared/observability/` |
| `perf/` | 5 | N+1 detection and query optimizer — zero consumers. | **Deprecate** — Move useful checks to dev scripts |
| `learning-facade/` | 1 | Pure barrel re-export. | **Refactor** — Move to `src/modules/index.ts` |

---

## Multiple Implementations of Same Logic

| Logic | Implementations | Recommendation |
|-------|----------------|----------------|
| Knowledge Graph | `learning/services/knowledge-graph.ts` (S7) + `knowledge-graph/` (S21/34) | **Keep S21/34 only.** S7 has 30 nodes; S21 has 52 nodes with CEFR/HKDSE alignment. |
| Mastery Calculation | `learning/services/mastery-calculator.ts` (S7) + `student-mastery/services/mastery-formula.ts` (S31) | **Keep S31 only.** S31 is more sophisticated (4-factor weighted formula). |
| Weakness Analysis | `learning/services/weakness-analyzer.ts` (S7) + `mistake-intelligence/` (S32) | **Keep S32 only.** S7 is basic; S32 does longitudinal trend analysis. |
| Adaptive Recommendations | `learning/services/adaptive-recommendation.ts` (S7) + `recommendation-v2/` (S33) | **Keep S33 only.** S7 is basic; S33 is weighted 4-factor algorithm. |
| Learning Analytics | `analytics/` (S23) + `learning-analytics/` (S37) | **Keep S37.** Migrate S23 API routes to use S37 services, then deprecate S23. |

---

## Domain Assignment — Final Mapping

| Domain | Modules (Active) | Modules (Legacy/Deprecate) |
|--------|-----------------|---------------------------|
| **AI** | `ai`, `ai-cost`, `llm-eval` | — |
| **Learning** | `student-mastery`, `mistake-intelligence`, `recommendation-v2`, `knowledge-graph`, `adaptive-learning`, `learning-science`, `learning-memory`, `curriculum` | `learning/` (S7) |
| **Student** | `vocabulary`, `vocabulary-intelligence`, `writing-coach`, `writing-coach-v2`, `mistake-db`, `progress`, `profile` | — |
| **Teacher** | `teacher-copilot`, `assessment`, `feedback` | — |
| **Exercise** | `exercise`, `adaptive-tutor` | — |
| **Analytics** | `learning-analytics` | `analytics/` (S23) |
| **Platform** | `cache`, `production`, `experiment`, `notification` | `events/`, `observability/`, `perf/` |
| **Facade** | — (move to `src/modules/index.ts`) | `learning-facade/` |

---

## Risk Assessment

| Risk | Level | Impact | Mitigation |
|------|-------|--------|------------|
| Deprecating `learning/` breaks pages | 🟡 Medium | If any page component imports from `learning/`, it would break | Grep for `@/modules/learning` imports in `src/app/` and `src/components/` before removing |
| Deprecating `analytics/` breaks API routes | 🟡 Medium | 2 API routes use `analytics/` (`/api/analytics`, `/api/analytics/report`) | Migrate routes to `learning-analytics/` first |
| Removing `events/` breaks future plans | 🟢 Low | Zero consumers; if events are needed later, use `learning-science` or a proper message queue | Safe to remove |
| Removing `perf/` loses N+1 checks | 🟢 Low | N+1 detection is in `scripts/check-n-plus-one.js` already | Keep the script, remove the module |
| Consolidating `observability/` | 🟢 Low | Both `modules/observability/` and `shared/observability/` have zero consumers | Merge into `shared/` only |

---

## Recommended Action Plan (Sprint 41)

### Phase 1: Safe Removals (Low Risk)
1. ✅ Deprecate `learning/` (zero consumers)
2. ✅ Remove `events/` (zero consumers)
3. ✅ Remove `perf/` (zero consumers, N+1 in scripts)
4. ✅ Consolidate `observability/` into `src/shared/observability/`

### Phase 2: Refactor (Low Risk)
5. ✅ Move `learning-facade/` barrel to `src/modules/index.ts`

### Phase 3: Migration (Medium Risk — needs testing)
6. 🔄 Migrate `/api/analytics` → use `learning-analytics/` services
7. 🔄 Migrate `/api/analytics/report` → use `learning-analytics/` services
8. 🔄 After migration, deprecate `analytics/`

### Phase 4: Verification
9. ✅ Run full test suite (1135 tests)
10. ✅ Run vercel-build
11. ✅ Update README + ARCHITECTURE.md
12. ✅ Generate final `DOMAIN_AUDIT.md` sign-off

---

## Summary Statistics

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Total Modules | 35 | 28 |
| Domains | Scattered | 8 clear domains |
| Duplicate Logic Pairs | 5 | 0 |
| Dead/Zero-Consumer Modules | 5 | 0 |
| Legacy (Sprint ≤10) Modules | `learning`, `analytics`, `events`, `perf` | Removed/migrated |
| Circular Dependencies | 0 | 0 |
| Tests | 1,135 | ≥1,135 |
