# ADR-015: AI Use Case Physical Extraction (Phase 2)

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 92

## Context

Sprint 91 removed duplicate helper functions from `ai-service.ts`, reducing it from 3,392 to 2,831 lines. Sprint 92 focuses on moving actual business logic (function bodies) into their canonical usecase files.

## Decision

### Extracted Use Cases

| Use Case | Usecase File | Status |
|---|---|---|
| `explainMistake` | `usecases/explain-mistake.ts` | ✅ Extracted |
| `analyzeAnswer` | `usecases/analyze-answer.ts` | ✅ Extracted |
| `analyzeWriting` | `usecases/analyze-writing.ts` | ✅ Extracted |
| `generateQuestions` | `usecases/generate-questions.ts` | ⏸️ Deferred (type coupling) |

### Infrastructure

- **`services/llm-call.ts`**: Extracted `callLLM` to break circular dependency between `ai-service.ts` and usecases. Both import from this shared module.

### Delegation Pattern

```typescript
// ai-service.ts (facade)
export { explainMistake, type ExplainMistakeInput, type MistakeExplanation }
  from '../usecases/explain-mistake';

// usecases/explain-mistake.ts (canonical)
import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
// ... other shared imports
export async function explainMistake(input: ExplainMistakeInput): Promise<MistakeExplanation> {
  // full implementation
}
```

### generateQuestions Deferral

`generateQuestions` remains in `ai-service.ts` due to type coupling with the `validateAndFixQuestion` backward-compatibility wrapper that also lives in `ai-service.ts`. Full extraction requires moving shared types (`GenerateQuestionsInput`, `GeneratedQuestion`) to a types-only module. Deferred to Sprint 93.

## Results

| Metric | Sprint 91 | Sprint 92 | Total Δ |
|---|---|---|---|
| `ai-service.ts` lines | 2,831 | **2,011** | **-1,381** |
| Architecture tests | 56 | **64** | +8 |
| Total tests | 990 | **998** | +8 |
| Usecases with implementations | 0 | **3** | +3 |
| New shared modules | 1 (question-normalizer) | 1 (llm-call) | +1 |

## Public API Compatibility

Zero changes. All 25 route consumers, internal modules, and test files continue to import from `@/modules/ai/services/ai-service` unchanged.
