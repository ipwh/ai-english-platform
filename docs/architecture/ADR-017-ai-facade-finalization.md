# ADR-017: AI Facade Finalization & Service Consolidation

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 94

## Context

Sprints 91-93 progressively reduced `ai-service.ts` from 3,392 to 1,295 lines by removing duplicate helpers, extracting shared types, and moving 4 priority use cases to `usecases/`. Sprint 94 completes the transformation: moving ALL remaining AI use case implementations out of the facade.

## Decision

### 1. Complete Use Case Extraction

All 13 AI use cases now own their implementations in `usecases/`:

| Usecase | File | Type |
|---|---|---|
| `generateQuestions` | `generate-questions.ts` | Sprint 93 |
| `analyzeAnswer` | `analyze-answer.ts` | Sprint 92 |
| `analyzeWriting` | `analyze-writing.ts` | Sprint 92 |
| `explainMistake` | `explain-mistake.ts` | Sprint 92 |
| `analyzeWord` | `analyze-word.ts` | Sprint 94 |
| `analyzeProgress` | `analyze-progress.ts` | Sprint 94 |
| `answerStudyHelp` | `study-help.ts` | Sprint 94 |
| `analyzeMaterial` | `analyze-material.ts` | Sprint 94 |
| `generateWritingPrompt` | `writing-prompt.ts` | Sprint 94 |
| `generateWritingOutline` | `writing-outline.ts` | Sprint 94 |
| `generateWritingGuide` | `writing-guide.ts` | Sprint 94 |
| `generateIntegratedSkills` | `integrated-skills-gen.ts` | Sprint 94 |
| `analyzeIntegratedSkills` | `integrated-skills-analysis.ts` | Sprint 94 |

### 2. Pure Facade Pattern

`ai-service.ts` is now a true Facade containing only:
- **Provider tracking**: `getLastAIProvider()`, `wasFallbackUsed()`
- **Configuration helpers**: `isDeepSeekConfigured()`, `isAIConfigured()`, `getAIProviders()`
- **Retry stats**: `resetRetryStats()`, `getRetryStats()`
- **Backward-compat wrappers**: `validateAndFixQuestion()`, `normalizeGeneratedQuestions`
- **Compatibility re-exports**: DSE types, chinglish, topics, schemas
- **Use case delegation**: 13 re-exports from `usecases/`
- **One inline function**: `generateAdaptiveWritingGuide` (complex coupling with `WritingGuide`)

Zero AI business logic, zero inline parsing, zero duplicate helpers.

## Results

| Metric | Sprint 91 Start | Sprint 94 End | Total Δ |
|---|---|---|---|
| `ai-service.ts` lines | 3,392 | **94** | **-3,298** |
| Usecase files | 4 (re-exports) | **14** (implementations) | +10 |
| Architecture tests | 50 | **79** | +29 |
| Total tests | 984 | **1,013** | +29 |
| ADRs | 13 | **17** | +4 |

## Facade Structure

```
ai-service.ts (94 lines)
├── Provider tracking (2 functions, 2 lines)
├── LLM call re-export (1 line)
├── Sanitizer re-export (1 line)
├── Configuration helpers (4 functions, 10 lines)
├── Retry stats (2 functions, 5 lines)
├── Backward-compat wrappers (2 functions, 6 lines)
├── Use case delegation (13 re-exports, 14 lines)
├── Compatibility re-exports (12 lines)
├── Schema re-exports (1 line)
└── generateAdaptiveWritingGuide (1 function, 8 lines)
```
