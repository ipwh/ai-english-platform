# ADR-024: AI Quality Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 101
- **Author**: Platform Team

## Context

The AI English Platform has 14 AI use cases, each with its own post-processing pipeline. Quality checks (validation, normalization, repair) are scattered across multiple modules: `question-validator.ts`, `question-normalizer.ts`, `listening-normalizer.ts`, `hallucination-guard.ts`, `mcq-filters.ts`, and inline in use cases. Only `generateQuestions` passes through the full quality pipeline. Other use cases receive minimal treatment.

As we scale to more AI-powered features, this inconsistency becomes a reliability risk.

## Decision

Create a new canonical module `src/modules/ai/quality/` that serves as the **final gate** between provider output and API response. This module:

1. Executes **pluggable quality rules** (Open/Closed Principle)
2. **Repairs safe defects** (missing answers, duplicate options, whitespace)
3. **Scores** AI output quality (0-100)
4. **Tracks metrics** centrally (repairs, failures, scores)
5. **Generates reports** for observability

The Quality Layer sits AFTER schema validation and BEFORE the API response:

```
Provider → Parser → Schema Validation → QUALITY LAYER → Workflow Result → API Response
```

## Consequences

### Positive
- Centralized quality enforcement for all AI outputs
- Pluggable rule architecture — new rules added without modifying engine
- Consistent quality scoring across use cases
- Centralized metrics for data-driven improvement
- No breaking changes to existing architecture

### Negative
- Additional processing overhead (~1-5ms per request for empty rules)
- New module to maintain
- Rules must be explicitly registered (not automatic)

### Risks Mitigated
- Inconsistent quality checks across use cases
- Scattered repair logic
- Missing metrics for quality failures
- Silent degradation when AI outputs have minor defects

## Architecture

```
src/modules/ai/quality/
├── quality-types.ts      # Core types (QualityRule, QualityResult)
├── quality-rule.ts       # BaseQualityRule abstract class
├── quality-engine.ts     # QualityEngine singleton
├── quality-registry.ts   # QualityRegistry singleton
├── repair-engine.ts      # Safe repair functions
├── quality-metrics.ts    # Metrics collection
├── quality-report.ts     # Report generation
├── index.ts              # Barrel export
└── __tests__/            # Architecture & unit tests
```

## Integration Point

The Quality Layer is called by use cases AFTER LLM response parsing and schema validation. Example integration:

```typescript
// In any usecase:
const parsed = parseAIJSON<T>(raw);
const validated = validateAIResponse(schema, parsed);
if (!validated.success) throw new Error(validated.error);

// NEW: Quality check
const qualityResult = await qualityEngine.execute(validated.data, {
  outputType: 'GeneratedQuestion',
  requestId: req.id,
});
return qualityResult.output; // repaired + scored
```

## Extension Mechanism

New quality rules are added by:
1. Extending `BaseQualityRule<T>`
2. Registering with `qualityRegistry.registerRule(new MyRule())`
3. No modification to QualityEngine required

## Ownership

- **Owned by**: AI Services module
- **Consumed by**: All AI use cases (voluntary adoption in Sprint 101, mandatory in later sprints)

## See Also
- ADR-005: Provider Isolation
- ADR-006: AI Use Case Architecture
- ADR-007: Runtime Governance
