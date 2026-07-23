# ADR-001: Domain Boundaries

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 52-72 (Architecture v5 consolidation)

## Context

The AI English Platform initially had 34 modules with overlapping responsibilities. Modules like `profile/`, `student-mastery/`, `progress/`, and `student-twin/` all managed different aspects of the same student entity. Similarly, `adaptive-learning/`, `recommendation/`, and `learning/` all computed learning decisions independently.

## Decision

Consolidate all related domain logic into canonical modules:

| Canonical Module | Merged From |
|---|---|
| `student/` | `profile/`, `progress/`, `student-mastery/`, `student-twin/` |
| `learning/` | `adaptive-learning/`, `recommendation/`, `learning-memory/`, `learning-science/` |
| `teacher/` | `teacher-copilot/`, `teacher-analytics/` |
| `mistake/` | `mistake-db/`, `mistake-intelligence/` |
| `vocabulary/` | `vocabulary-intelligence/` |

Each canonical module exports exactly one facade: `{module}/index.ts`.

## Alternatives Considered

- **Keep separate modules**: Rejected — led to circular dependencies, duplicated algorithms, and 3 independent scoring engines.
- **Microservices per module**: Rejected — over-engineering for a Next.js monolith; would add network latency without benefit.

## Consequences

- Module count: 34 → 23 (35% reduction)
- Duplicate DSE weight tables: 5 → 1
- Duplicate decision engines: 3 → 1 (`LearningDecisionEngine`)
- Architecture tests: 34 → 40 (enforcement strengthened)
- All public APIs preserved through facade re-exports

## Ownership

Each domain module owns exactly one business capability. Cross-domain access goes through facades only.
