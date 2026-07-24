# ADR-030: Prompt Intelligence & Self-Reflection

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 109

## Context

AI-generated question quality depends heavily on prompt quality. Current system sends prompts directly to LLM without pre-validation or post-reflection. This leads to avoidable failures (missing answers, wrong option counts) that downstream Quality/Assessment/Repair layers must fix.

## Decision

Introduce a **Prompt Intelligence Layer** that operates BEFORE and AFTER LLM calls:

1. **Prompt Builder** — assembles prompts from components (system, domain, difficulty, skill, quality constraints)
2. **Prompt Validator** — detects missing instructions, conflicting constraints, duplicates before sending
3. **Prompt Optimizer** — injects 13 auto-generated quality constraints
4. **Self-Reflection** — deterministic post-LLM check for answer presence, MCQ count, explanation presence, duplicates, placeholders
5. **Metrics** — tracks prompt complexity, constraint counts, reflection scores

All operations are deterministic. No LLM calls within this layer.

## Consequences
- Catches prompt defects before LLM invocation
- Reflection provides immediate feedback loop for prompt improvement
- Reduces downstream repair/rejection load
- Minimal overhead (~1ms for validation, ~5ms for reflection)

## See Also
- ADR-024: AI Quality Layer
- ADR-025: Content Consistency Layer
