# ADR-011: Workflow Stage Library & Registry

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 88

## Context

After Sprint 87, the Workflow Engine existed but workflow stages were defined inline within each workflow definition. There was no standard library of reusable stages, and no registry for discovering workflows at runtime.

## Decision

Create a Reusable Stage Library and Workflow Registry:

**Stage Library** (`ai/workflows/stages/`):

| Stage | Responsibility | Delegates To |
|---|---|---|
| `ContextStage` | Build workflow context from input | `pipeline-context.ts` |
| `ProviderStage` | Execute AI call | `executeAIPipeline()` |
| `RetryStage` | Track retry decisions | `retry.ts` |
| `ParserStage` | Track parse/repair events | `response-parser.ts` |
| `ValidationStage` | Track validation events | Zod schemas |
| `MetricsStage` | Record runtime metrics | `runtime-metrics.ts` |
| `ResultStage` | Build `WorkflowResult<T>` | Context assembly |

**Workflow Registry** (`ai/workflows/workflow-registry.ts`):
- `register(workflow)` / `unregister(name)`
- `getWorkflow(name)` / `listWorkflows()`
- `getWorkflowsByTag(tag)`
- `getStats()` for dashboard

**Rules**:
1. Every stage implements `WorkflowStage` — owns exactly one responsibility
2. Stages delegate to existing implementations — no duplicated logic
3. Stages must NOT import Prisma, Repositories, Routes, or Providers directly
4. Workflow definitions are pure composition of stages — no execution logic
5. Workflow definitions are registered via `workflowRegistry.register()`

## Alternatives Considered

- **Pipeline stages as classes**: Rejected — plain objects with `execute()` are simpler and more composable.
- **No registry (direct imports)**: Rejected — prevents runtime discovery and dynamic composition.

## Consequences

- Workflow definitions become declarative: `defineWorkflow({ name, stages: [ContextStage, ProviderStage, ...] })`
- Stages are independently testable and reusable
- Workflows can be discovered at runtime via registry tags
- Foundation for future visual workflow builder

## Ownership

`ai/workflows/stages/` — reusable stage library  
`ai/workflows/workflow-registry.ts` — canonical workflow registry  
`ai/workflows/workflow-engine.ts` — executes registered stages
