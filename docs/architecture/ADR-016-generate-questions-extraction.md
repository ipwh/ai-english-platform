# ADR-016: GenerateQuestions Extraction & AI Type Consolidation

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 93

## Context

Sprint 92 extracted 3 of 4 priority use cases from `ai-service.ts`. `generateQuestions` was deferred due to type coupling — `GenerateQuestionsInput` and `GeneratedQuestion` types were shared between the function body, the `validateAndFixQuestion` backward-compatibility wrapper, and `question-normalizer.ts`.

## Decision

### 1. Create Canonical Types Module

`ai/types/generation-types.ts` now owns:
- `GenerateQuestionsInput`
- `GeneratedQuestion`

All consumers import from this single source:
- `ai-service.ts` (wrapper functions, type re-exports)
- `usecases/generate-questions.ts` (canonical implementation)
- `question-normalizer.ts` (normalization logic)

### 2. Extract generateQuestions

The full 687-line `generateQuestions` implementation (including inline prompts, retry logic, RAG integration, question validation, and JSON repair) moved to `usecases/generate-questions.ts`.

`parseGeneratedQuestions` (private helper) moved with it.

### 3. ai-service.ts Delegation

```typescript
// ai-service.ts — thin delegation
import type { GenerateQuestionsInput, GeneratedQuestion } from '../types/generation-types';
export type { GenerateQuestionsInput, GeneratedQuestion };
export { generateQuestions } from '../usecases/generate-questions';
```

## Results

| Metric | Sprint 92 | Sprint 93 | Total Δ |
|---|---|---|---|
| `ai-service.ts` lines | 2,011 | **1,295** | **-2,097** |
| Architecture tests | 64 | **72** | +8 |
| Total tests | 998 | **1,006** | +8 |
| Usecases with implementations | 3 | **4** | 100% |
| Shared type modules | 0 | 1 (`types/generation-types`) | +1 |

## ai-service.ts Remaining Responsibilities

After Sprint 93, `ai-service.ts` contains only:
- `callLLM` (re-export from `llm-call.ts`)
- `getLastAIProvider`, `wasFallbackUsed` — provider tracking
- `isDeepSeekConfigured`, `isAIConfigured`, `getAIProviders` — config checks
- `resetRetryStats`, `getRetryStats` — retry metrics
- `validateAndFixQuestion` backward-compatibility wrapper
- `sanitizeForAI` re-export
- 9 remaining AI functions (analyzeWord, analyzeProgress, etc.)
- Type re-exports

Zero question generation business logic remains in the facade.
