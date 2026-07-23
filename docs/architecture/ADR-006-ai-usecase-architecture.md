# ADR-006: AI Use Case Architecture

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 77-78

## Context

`ai/services/ai-service.ts` (~3400 lines) contained 12 distinct business use cases interleaved with provider logic, prompt construction, and retry handling. This made the file difficult to maintain, test, and decompose.

## Decision

Each AI business use case becomes a separate service file under `ai/usecases/`. `ai-service.ts` becomes a pure facade that delegates to use-case services.

```
ai/usecases/
    generate-questions.ts     ← Question generation pipeline + retry
    analyze-answer.ts         ← Student answer analysis
    analyze-writing.ts        ← Writing analysis + feedback
    explain-mistake.ts        ← Mistake explanation generation
    analyze-progress.ts       ← Learning progress analysis
    answer-study-help.ts      ← Study help conversation
    analyze-material.ts       ← Material content analysis
    generate-writing.ts       ← Writing prompt + outline generation
```

`ai-service.ts` responsibilities after decomposition:
- Public API (re-exports)
- Orchestration (dependency wiring)
- Delegation to use-case services

**Rules**:
1. AI service files ≤ 800 lines (enforced by architecture test v8)
2. No prompt construction in facade
3. No provider selection in use cases (delegate to `providerRegistry`)
4. No retry loops in use cases (delegate to `retry-policy.ts` in providers)

## Alternatives Considered

- **Full extraction of all use cases at once**: Deferred — high risk of breaking 25+ consumers. Phased extraction preferred.
- **Microservices per use case**: Rejected — over-engineering; Next.js API routes already provide service boundaries.

## Consequences

- Deprecated legacy code extracted: `ai-legacy.ts` (138 lines, 0 consumers)
- Provider-specific logic isolated to `providers/`
- Architecture enforcement: 3 new tests (v8)
- Migration path: use cases can be extracted one at a time without breaking consumers

## Ownership

`ai/services/ai-service.ts` — facade (orchestration + delegation)  
`ai/usecases/` — individual business capabilities  
`ai/providers/` — provider implementations + retry policy
