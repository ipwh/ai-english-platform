# ADR-002: Student Runtime Model

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 59-61, 74

## Context

Student data was assembled independently by multiple services:
- `learning-analytics` queried `student/mastery/repositories` directly
- `activity-accounting-service` wrote `db.user.update()` directly
- `adaptive-learning-pipeline` imported mastery/mistake repos via lazy import
- No single source of truth for student state

## Decision

Adopt CQRS pattern for student state:

```
READ:  StudentStateBuilder.build(studentId) → StudentState (immutable)
WRITE: StudentStateMutationService → Repository → Prisma
```

**Rules**:
1. `StudentStateBuilder` is the ONLY component allowed to assemble `StudentState`
2. `StudentStateMutationService` is the ONLY component allowed to mutate student engagement state
3. No service outside `student/` may import `student/*/repositories/`
4. Analytics services receive `StudentState`, not repository objects

## Alternatives Considered

- **Keep direct repository access**: Rejected — led to 5 duplicated data assembly paths.
- **GraphQL federation**: Rejected — over-engineering for current scale.

## Consequences

- Direct DB reads bypassing builder: 3 → 0
- Direct DB writes bypassing mutation service: 2 → 0
- Architecture enforcement tests: 5 added (Sprint 74)
- All public APIs unchanged

## Ownership

`student/state/StudentStateBuilder.ts` — canonical read path  
`student/state/StudentStateMutationService.ts` — canonical write path
