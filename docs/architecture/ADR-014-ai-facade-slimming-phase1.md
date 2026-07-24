# ADR-014: AI Facade Slimming (Phase 1) — Physical Extraction

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 91

## Context

`ai-service.ts` was 3,392 lines — the largest file in the codebase. Many helper functions existed in duplicate: defined both in `ai-service.ts` and in their extracted modules (`question-validator.ts`, `listening-normalizer.ts`, `json-utils.ts`) from Sprint 0.5. The extracted modules were never actually consumed by `ai-service.ts`.

## Decision

1. **Remove duplicate helpers** from `ai-service.ts`, replacing them with imports from extracted modules
2. **Move `normalizeGeneratedQuestions`** into a new `question-normalizer.ts` (could not go into `question-validator.ts` due to circular dependency with `listening-normalizer.ts`)
3. **Add Sprint 91 governance tests** to architecture suite

## Extraction Map

| Removed from ai-service.ts | Now consumed from |
|---|---|
| `toMcqLetter`, `stripMcqPrefix`, `normalizeMcqAnswer`, `normalizeAnswer` | `question-validator.ts` |
| `validateAndFixQuestion` (inline body) | `question-validator.ts` (thin wrapper retained) |
| `normalizeGeneratedQuestions` (inline body) | `question-normalizer.ts` (new file) |
| `sanitizeListeningLine`, `validateListeningContent`, `normalizeListeningContent` | `listening-normalizer.ts` |
| `validateListeningConsistency` (inline body) | `listening-normalizer.ts` |
| `parseAIJSON`, `extractBalancedJson`, `repairTruncatedJSON` | `json-utils.ts` |

## Results

| Metric | Before | After | Change |
|---|---|---|---|
| `ai-service.ts` lines | 3,392 | 2,831 | **-561** |
| Architecture tests | 50 | **56** | +6 |
| Total tests | 984 | **990** | +6 |
| TypeScript errors | 0 | 0 | — |
| Public API changes | 0 | 0 | — |
| Behavior changes | 0 | 0 | — |

## Canonical Helper Ownership

| Helper | Canonical Owner | Consumers |
|---|---|---|
| MCQ helpers (`toMcqLetter`, etc.) | `question-validator.ts` | ai-service, listening-normalizer, question-normalizer, question-generation |
| `validateAndFixQuestion` | `question-validator.ts` | ai-service (thin wrapper), question-normalizer |
| `normalizeGeneratedQuestions` | `question-normalizer.ts` | ai-service |
| Listening helpers | `listening-normalizer.ts` | ai-service, question-normalizer |
| JSON parsing | `json-utils.ts` | ai-service, question-generation, integrated-skills |

## Remaining Work

9 other AI functions in `ai-service.ts` still have inline implementations (analyzeWord, analyzeProgress, answerStudyHelp, analyzeMaterial, generateWritingPrompt, generateWritingOutline, generateWritingGuide, generateIntegratedSkills, analyzeIntegratedSkills). These are candidates for future extraction phases.
