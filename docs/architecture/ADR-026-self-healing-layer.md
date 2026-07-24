# ADR-026: Self-Healing Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 104
- **Depends on**: ADR-024, ADR-025

## Context

Sprint 101 introduced the Quality Engine for validating AI outputs. Sprint 102 added structural rules, and Sprint 103 added content consistency rules. However, when rules fail, the only option was to reject the output. A more sophisticated approach is needed: attempt the safest possible repair before rejecting.

## Decision

Introduce a **Self-Healing Layer** that upgrades the Quality Layer from `Validate → Reject` to `Validate → Repair → Patch → Regenerate → Approve`.

### Key Components

1. **RepairAction** — 12 categorized actions from NORMALIZE to REJECT
2. **RepairPlan** — Deterministic, prioritized plan for execution
3. **RepairPlanner** — Collects failed rules, groups compatible repairs, resolves priority
4. **RepairPipeline** — Orchestrates: Quality Engine → Planner → Repair Engine → Revalidate → Approve/Reject
5. **RepairBudget** — Prevents infinite loops (max 2 patches, 1 regeneration, 15s total)
6. **RepairHistory** — Immutable audit trail of all repairs
7. **RepairMetrics** — Tracks success rates, performance, top actions
8. **RepairReport** — Structured repair summary

### Repair Priority (lowest cost first)
```
NORMALIZE → PATCH_FIELD → PATCH_OPTIONS → PATCH_ANSWER →
PATCH_EXPLANATION → PATCH_REFERENCE → PATCH_DIFFICULTY →
REGENERATE_FIELD → REGENERATE_QUESTION → REJECT
```

### Design Principles
- **Prefer deterministic repair over regeneration** — all PATCH actions are deterministic
- **Never regenerate entire output when local repair suffices**
- **All repairs are auditable** — history tracks original value, new value, rule, action, timestamp
- **Budget constraints** — prevents infinite loops and resource exhaustion

## Consequences

### Positive
- Graduated response to quality failures (not binary accept/reject)
- Budget system prevents runaway repair loops
- Full audit trail for debugging and optimization
- Health endpoint exposes real-time repair metrics

### Limitations
- Regeneration actions are reserved but not yet implemented (requires LLM integration in future sprint)
- Repair strategy mapping is static — could be dynamic based on context
- No cross-question repair (each question repaired independently)

## Future Extension
- LLM-based targeted field regeneration
- Dynamic repair strategy based on historical success rates
- Cross-question consistency repair
- Adaptive budget based on question importance

## See Also
- ADR-024: AI Quality Layer
- ADR-025: Content Consistency Layer
