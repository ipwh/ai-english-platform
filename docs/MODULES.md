# Module Documentation

> 18 modules | 328 tests | Auto-generated 2026-07-18

## `ai/` — AI Services (20 services, 2 tests)

Core AI module. Handles question generation, writing analysis, answer grading, mistake explanation, study help, integrated skills, and RAG (Retrieval-Augmented Generation).

| Service | Purpose |
|---------|---------|
| `ai-service.ts` | Main orchestrator, legacy compat |
| `question-generation.ts` | Generate DSE practice questions |
| `writing-analysis.ts` | Grade essays (CLO framework) |
| `writing-generation.ts` | Generate writing prompts + outlines |
| `answer-analysis.ts` | Grade student answers |
| `integrated-skills.ts` | DSE Paper 3 tasks |
| `rag-service.ts` | Vector search for past papers |
| `tts-service.ts` | Text-to-speech |
| `sanitizer.ts` | Input sanitization |

**Prompts**: `writing/v1.ts`, `grammar/v1.ts`, `reading/v1.ts`, `speaking/v1.ts`  
**Providers**: `deepseek`, `gemini`, `vertex-gemini`, `claude` (placeholder), `openai` (placeholder)

---

## `learning/` — Learning Engine (6 services, 1 test)

Grammar dependency DAG, mastery calculation, weakness analysis, adaptive recommendations.

```ts
import { getRecommendations } from '@/modules/learning/services';
```

- 31 grammar skills in dependency graph (S1-S6)
- Topological sort, prerequisite checking
- Mastery: accuracy (60%) + recency (25%) + volume (15%)

---

## `profile/` — Student Profile (5 services, 1 test)

Aggregates student data into unified learning profile.

- 6 skill dimensions (grammar/vocabulary/writing/reading/speaking/listening)
- 9 topic categories, learning speed metrics
- Integrates with Learning Engine

---

## `mistake-db/` — Mistake Database (4 services, 1 test)

Tracks, analyzes, and generates review recommendations from mistakes.

- 6 mistake categories, 16 grammar point heuristics
- SM-2 SRS scheduling, mastery estimation

---

## `vocab-graph/` — Vocabulary Graph (5 services, 1 test)

Word families, synonyms/antonyms, collocations, CEFR/HKDSE levels.

- 10 curated word families, 40+ DSE vocabulary entries
- CEFR ↔ HKDSE level mapping

---

## `events/` — Domain Events (pub/sub, 1 test)

In-process event bus with error isolation.

- 6 event types (exercise:completed, essay:submitted, vocabulary:learned, etc.)
- Progress handler + Achievement handler (7 achievements)
- `on()` / `emit()` / unsubscribe pattern

---

## `cache/` — Caching (TTL Map, 1 test)

In-memory cache with Redis-compatible interface.

- `getOrCompute()` cache-aside pattern
- 6 namespace key generators (grammar/vocab/reading/exercise/essay/ai)
- Auto-pruning, stats tracking

---

## `ai-cost/` — AI Cost Optimization (1 test)

Token estimation, per-model cost calculation, prompt deduplication.

- 5 models priced (DeepSeek, Gemini, Vertex)
- Hash-based duplicate detection
- Monthly cost projection

---

## `perf/` — Performance (1 test)

N+1 query detection, bundle analysis, optimization reports.

- `detectNPlusOne()` with time-clustering
- `createIdBatcher()` for debounced batching
- Tree-shaking score, lazy loading guidance

---

## `security/` — Security (1 test)

Input sanitization, prompt injection prevention, security auditing.

- 11 prompt injection patterns, 9 XSS, 5 PII, 8 SQL injection
- `sanitizeInput()` with risk scoring (0-100)
- CSP validation, security audit (A-F grading)

---

## `observability/` — Observability (1 test)

Metrics, tracing, latency monitoring, error aggregation.

- Counters, histograms (p50/p95/p99), gauges, timers
- Trace/span with IDs, `traceAsync()` helper
- AI + DB latency with slow-call warnings
- Health report (healthy/degraded/unhealthy)

---

## Other Modules

| Module | Services | Tests |
|--------|----------|-------|
| `assessment/` | chinglish, plagiarism, assessment-service | 1 |
| `exercise/` | exercise-service | 1 |
| `feedback/` | feedback-service | 1 |
| `student/` | student-service | 1 |
| `progress/` | gamification, streak-service, progress-service | 1 |
| `vocabulary/` | srs, vocabulary-service | 2 |
| `notification/` | repo only | 0 |
