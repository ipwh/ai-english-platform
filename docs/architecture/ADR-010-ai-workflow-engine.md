# ADR-010: AI Workflow Engine

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 87

## Context

After Sprint 86, the AI platform had a canonical pipeline, runtime governance, observability, and plugin architecture. However, use cases still composed pipeline calls imperatively with scattered stage orchestration. There was no standard way to define, compose, and execute AI workflows declaratively.

## Decision

Introduce a declarative AI Workflow Engine at `ai/workflows/`:

```
Workflow Definition (declarative config)
    ↓
Workflow Engine (execution)
    ↓
Custom Stages OR Pipeline (provider + retry + parse + validate)
    ↓
Workflow Result (typed output + stages + metrics)
```

**Components**:
- `WorkflowDefinition<TInput, TOutput>`: name, stages, executionPolicy, outputSchema, tags, metadata
- `WorkflowStage<TContext>`: name, execute(context), optional rollback
- `WorkflowContext<TInput, TOutput>`: request, response, executionPolicy, retryCount, warnings, stages, metadata
- `WorkflowEngine`: execute(workflow, input) — orchestrates stages sequentially, delegates to pipeline

**Rules**:
1. WorkflowEngine does NOT import Prisma, Repositories, Routes, or Providers directly
2. WorkflowEngine internally reuses `executeAIPipeline()` — no duplicated orchestration
3. Workflows are declarative (`defineWorkflow({...})`) — stages are composable
4. Stage failures trigger rollback if defined

## Alternatives Considered

- **Keep imperative composition**: Rejected — scattered orchestration, no standard pattern.
- **External workflow engine (Temporal/Cadence)**: Deferred — over-engineering for current scale.

## Consequences

- Use cases can execute `workflowEngine.execute(GenerateQuestionsWorkflow, request)` without changing public APIs
- Workflow stages are composable and independently testable
- Stage execution timing is automatically collected
- Foundation for future visual workflow builder

## Ownership

`ai/workflows/workflow-engine.ts` — canonical workflow executor  
`ai/workflows/workflow.ts` — declarative workflow definition  
`ai/workflows/workflow-stage.ts` — composable stage interface  
`ai/workflows/workflow-context.ts` — runtime context
