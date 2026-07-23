# ADR-003: Learning Runtime Model

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 64-66

## Context

Three independent decision engines existed:
1. `recommendation-engine.ts` — 4-factor weighted algorithm
2. `learning-engine.ts` — strategy decider
3. `dse-adaptive-path.ts` — DSE exam path builder

Each had its own weight tables (`DSE_GRAMMAR_WEIGHTS`, `DSE_TOPIC_WEIGHTS`, `CANONICAL_DSE_WEIGHTS`), scoring formulas, and decision logic.

## Decision

Merge into a single canonical decision engine:

```
LearningDecisionEngine (canonical)
    ↓
StudentState (input)
    ↓
LearningDecision[] (output)
```

**Rules**:
1. `LearningDecisionEngine` reads `StudentState` only — zero repo/db/Prisma imports
2. All DSE weights derive from `CANONICAL_DSE_WEIGHTS` in `LearningDecision.ts`
3. `EvidenceEvaluationService` is pure computation — evaluates decisions without side effects
4. `recommendation-engine.ts` is a thin formatter over `LearningDecisionEngine`

## Alternatives Considered

- **Keep separate engines**: Rejected — 3 duplicate scoring algorithms, 5 duplicate weight tables.
- **ML-based recommendation**: Rejected — deterministic rules preferred for explainability in education.

## Consequences

- Decision engines: 3 → 1
- DSE weight tables: 5 → 1 (`CANONICAL_DSE_WEIGHTS`)
- `recommendation-engine.ts`: 240 → 85 lines (thin formatter)
- Architecture enforcement: learning services cannot import Prisma/repos

## Ownership

`learning/decisions/LearningDecisionEngine.ts` — canonical decision engine  
`learning/decisions/LearningDecision.ts` — canonical types + weights  
`learning/decisions/EvidenceEvaluationService.ts` — pure evaluation
