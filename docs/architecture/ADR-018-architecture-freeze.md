# ADR-018: Architecture Freeze

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 95

## Context

Sprints 69-94 transformed the AI English Platform from 34 fragmented modules into a disciplined architecture. Sprint 95 freezes the architecture — no new abstractions, only consolidation.

## Decision

### Architecture Freeze Criteria

The following are **frozen** and may only change via new ADR:

| Layer | Status | Owner |
|---|---|---|
| Facade pattern | Frozen | `ai/services/ai-service.ts` (94-line pure facade) |
| Usecase ownership | Frozen | 13 files in `ai/usecases/` |
| Workflow engine | Frozen | `ai/workflows/` — 13 registered workflows |
| Event bus | Frozen | `platform/events/` — 23 event types |
| Plugin architecture | Frozen | `platform/plugins/` — registry + loader |
| Runtime governance | Frozen | `ai/runtime/` — circuit breaker, budget, policies |
| AI pipeline | Frozen | `ai/pipeline/` — canonical LLM call path |
| Provider registry | Frozen | `ai/providers/` — 5-model fallback chain |
| CQRS runtime | Frozen | `student/state/` — Builder + MutationService |

### Dependency Audit Results

- **0 circular imports** detected and enforced by architecture tests
- **0 duplicate helper definitions** — all canonical owners verified
- **5 dead files removed**: `question-generation.ts`, `answer-analysis.ts`, `context-builder.ts`, `hk-social-contexts.ts`, `ai-legacy.ts`
- **1 page component fixed**: `diagnostic/page.tsx` now imports canonical helpers from `question-validator.ts` instead of private copies

### Legacy Removal

| Item | Status |
|---|---|
| `ai-legacy.ts` (141 lines, past removal date) | ✅ Removed |
| `question-generation.ts` (Sprint 5 dead code) | ✅ Removed |
| `answer-analysis.ts` (Sprint 5 dead code) | ✅ Removed |
| `context-builder.ts` (zero consumers) | ✅ Removed |
| `hk-social-contexts.ts` (zero consumers) | ✅ Removed |
| `diagnostic/page.tsx` private helpers | ✅ Migrated to canonical |

### Remaining Technical Debt

| Item | Priority | Sprint |
|---|---|---|
| `writing-generation.ts` TODO (split 750-line file) | Low | Future |
| `rag-service.ts` legacy fallback paths | Low | Future |
| `STRICT_ANSWER_RULES` dual re-export path | Low | Future |

### Future Extension Policy

1. New AI use cases → create file in `usecases/`, register in `ai-service.ts`
2. New shared helpers → create in `services/`, ensure single canonical owner
3. New types → create in `types/` if shared; inline in usecase if private
4. New architecture → requires ADR

## Results

| Metric | Sprint 94 | Sprint 95 |
|---|---|---|
| `ai-service.ts` lines | 94 | 94 |
| Architecture tests | 79 | **85** |
| Total tests | 1013 | **1019** |
| Dead files removed | 0 | **5** |
| ADRs | 17 | **18** |
| Circular imports | 0 | 0 |
| Duplicate helpers | 0 | 0 |
