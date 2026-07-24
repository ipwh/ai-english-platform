# ADR-031: Adaptive Prompt Feedback Loop

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 110 architecture review
- **Module**: `src/modules/ai/prompt-intelligence/feedback/`

---

## Context

The platform had 5 independent quality layers (Quality, Repair, Evaluation, Assessment, Optimization) plus Self-Reflection. Each layer analyzed AI output and produced results, but these results were consumed independently. There was no feedback loop: repeated failures in the same rule did not influence future prompt generation.

The pipeline was linear:

```
Prompt Builder → Prompt Optimizer → Prompt Validator → LLM → Self Reflection → Quality → Repair → Evaluation → Assessment → Optimization → API Response
```

This meant that if AnswerFieldRule failed 500 times, the system would never learn to inject "Always include answer field." into future prompts. Each failure was handled in isolation.

## Decision

Build a **deterministic closed-loop feedback system** that:
1. **Collects** failures from all 6 layers (Quality, Repair, Evaluation, Assessment, Optimization, Self-Reflection)
2. **Normalizes** them into `FeedbackEvent` objects
3. **Detects** recurring failure patterns (SameRule, HighRepairRate, LowAssessment, etc.)
4. **Learns** from patterns by converting them into `KnowledgeItem` objects
5. **Injects** dynamic constraints into the Prompt Builder alongside static constraints

Resulting pipeline:

```
Prompt Builder → Prompt Optimizer → Prompt Validator → Adaptive Prompt Knowledge → LLM → Self Reflection → Quality → Repair → Evaluation → Assessment → Optimization → Feedback Collector → Knowledge Base ↖ Prompt Builder
```

All operations are **100% deterministic**. No LLM calls. No embeddings. No vector search. No machine learning.

## Architecture

### Files

| File | Purpose |
|------|---------|
| `feedback-types.ts` | Core types: FeedbackEvent, DetectedPattern, KnowledgeItem, DynamicConstraint, etc. |
| `feedback-history.ts` | Immutable audit trail of feedback events (5000 cap) |
| `feedback-registry.ts` | Open/Closed registry for feedback collectors |
| `feedback-pattern.ts` | Detects 6 pattern types: RepeatedFailure, HighRepairRate, LowAssessment, LowReflection, PoorEvaluation, PromptWeakness |
| `feedback-knowledge.ts` | Additive knowledge base. Each item has: rule, trigger, constraint, priority, confidence, activationThreshold |
| `feedback-learning.ts` | Converts patterns → knowledge. Runs learning cycles (detect → create/update → expire) |
| `feedback-engine.ts` | Central coordinator with built-in collectors for all 6 layers |
| `feedback-metrics.ts` | Tracks all feedback operations, patterns, knowledge, improvement rates |
| `feedback-report.ts` | Generates Markdown and JSON reports |

### Feedback Collectors (6 built-in)

Each collector normalizes its layer's specific output format into `FeedbackEvent[]`:

- **QualityCollector**: Maps `QualityResult.checks` → events (ruleId, severity, category, repairable)
- **RepairCollector**: Maps `RepairPipelineResult` → events (ruleId, success=false)
- **EvaluationCollector**: Maps evaluation decision + rule results → events
- **AssessmentCollector**: Maps `AssessmentResult.checks` → events (ruleId, dimension, score)
- **OptimizationCollector**: Maps `OptimizationResult.checks` → events
- **ReflectionCollector**: Maps `ReflectionResult.checks` → events

New collectors can be registered via `registerFeedbackCollector()` (Open/Closed Principle).

### Pattern Detection

6 pattern types with configurable thresholds:

| Pattern | Trigger | Threshold |
|---------|---------|-----------|
| RepeatedFailure | Same rule failed N times | 20 |
| HighRepairRate | Repair rate > 30% | 30% |
| LowAssessment | Dimension avg < 60 | 60 |
| LowReflection | Reflection score < 70 | 70 |
| PoorEvaluation | Evaluation score < 60 | 60 |
| PromptWeakness | Same category failed N times | 50 |

### Knowledge Base

Constraints are additive. Static constraints (13 built-in) are never overwritten. Dynamic constraints are appended after static constraints, ordered by priority → confidence → activation count.

Max 20 dynamic constraints. Inactive knowledge expires after 30 days.

### Integration with Prompt Builder

```typescript
// prompt-builder.ts
function buildPrompt(components) {
  // ... static constraints ...
  parts.push(`## Quality Constraints (Auto-Injected)\n${staticConstraints}`);

  // Dynamic adaptive constraints (Sprint 110)
  const dynamicConstraints = buildDynamicConstraintText();
  if (dynamicConstraints) {
    parts.push(`## Learned Constraints (Adaptive)\n${dynamicConstraints}`);
  }
  // ...
}
```

### Rules

- Must NOT import: Providers, Workflow, Prisma, Database, LLM
- No external services
- No AI calls
- 100% deterministic
- Open/Closed: new Quality/Assessment/Optimization rules auto-produce feedback

## Consequences

### Positive
- Platform becomes self-improving without human intervention
- Repeated failures automatically strengthen future prompts
- All improvements are deterministic, explainable, and auditable
- Zero additional infrastructure (in-memory only)
- Zero LLM cost

### Negative
- In-memory storage resets on server restart (acceptable for v1)
- Pattern detection requires sufficient event volume (cold start)
- Maximum 20 dynamic constraints (by design: prevents prompt bloat)

## Alternatives Considered

1. **LLM-based learning**: Would analyze failures and generate improved prompts via AI. Rejected: non-deterministic, expensive, hard to audit.
2. **Database persistence**: Would survive restarts. Rejected: adds Prisma dependency, violates architecture rule. Can be added in future sprint.
3. **ML-based pattern detection**: Would use statistical models. Rejected: violates "no ML" constraint, over-engineered for current needs.
