# ADR-012: Workflow Adoption (Phase 1)

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 89

## Context

After Sprint 88, the Workflow Engine, Registry, and Stage Library existed but no AI use cases actually executed through them. Use cases still called `providerRegistry.call()` and `executeAIPipeline()` directly.

## Decision

Migrate the first 4 AI use cases to execute through the Workflow Engine via auto-registered workflow definitions:

| Use Case | Workflow | Stages |
|---|---|---|
| `generateQuestions` | `GenerateQuestionsWorkflow` | ContextStage, ProviderStage, MetricsStage, ResultStage |
| `analyzeAnswer` | `AnalyzeAnswerWorkflow` | ContextStage, ProviderStage, MetricsStage, ResultStage |
| `analyzeWriting` | `AnalyzeWritingWorkflow` | ContextStage, ProviderStage, MetricsStage, ResultStage |
| `explainMistake` | `ExplainMistakeWorkflow` | ContextStage, ProviderStage, MetricsStage, ResultStage |

**Migration strategy**:
1. Workflow definitions auto-register on module import (`workflowRegistry.register()`)
2. Existing public API signatures remain identical
3. Facade wraps workflow execution — strips `WorkflowResult` metadata
4. Zero breaking changes to 25 external consumers

**Rules**:
1. Use cases must not call `executeAIPipeline()` or `providerRegistry.call()` directly
2. All orchestration goes through `workflowEngine.execute()`
3. Facade strips metadata before returning to consumers

## Alternatives Considered

- **Rewrite all use cases at once**: Rejected — high risk of breaking 25 consumers.
- **Keep direct calls (no migration)**: Rejected — defeats purpose of workflow architecture.

## Consequences

- 4 workflow definitions auto-registered
- Workflow adoption begun with zero breaking changes
- Remaining use cases (`analyzeWord`, `analyzeProgress`, `answerStudyHelp`, `analyzeMaterial`, writing generation) deferred to Sprint 90
- Architecture tests enforce workflow usage

## Ownership

`ai/workflows/*.workflow.ts` — workflow definitions (auto-registering)  
`ai/services/ai-service.ts` — facade (unchanged public API)  
`ai/workflows/workflow-engine.ts` — execution engine
