# ADR-013: Workflow Adoption (Phase 2) — Full Migration

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 90

## Context

After Sprint 89, 4 AI use cases were migrated to the Workflow Engine. 9 remaining use cases still executed through direct provider/pipeline calls.

## Decision

Complete the migration — all 13 public AI entry points now execute through the Workflow Engine:

| # | Workflow | Use Case |
|---|---|---|
| 1 | `GenerateQuestionsWorkflow` | `generateQuestions` |
| 2 | `AnalyzeAnswerWorkflow` | `analyzeAnswer` |
| 3 | `AnalyzeWritingWorkflow` | `analyzeWriting` |
| 4 | `ExplainMistakeWorkflow` | `explainMistake` |
| 5 | `AnalyzeWordWorkflow` | `analyzeWord` |
| 6 | `AnalyzeProgressWorkflow` | `analyzeProgress` |
| 7 | `StudyHelpWorkflow` | `answerStudyHelp` |
| 8 | `AnalyzeMaterialWorkflow` | `analyzeMaterial` |
| 9 | `WritingPromptWorkflow` | `generateWritingPrompt` |
| 10 | `WritingOutlineWorkflow` | `generateWritingOutline` |
| 11 | `WritingGuideWorkflow` | `generateWritingGuide` |
| 12 | `IntegratedSkillsWorkflow` | `generateIntegratedSkills` |
| 13 | `IntegratedSkillsAnalysisWorkflow` | `analyzeIntegratedSkills` |

**Canonical execution path**:
```
Facade → WorkflowRegistry → WorkflowEngine → Stage Library → AI Pipeline → Provider Registry → Provider
```

## Consequences

- 13 workflow definitions, all auto-registering
- Zero public API changes — 25 consumers unchanged
- Every AI use case follows the same execution path
- Stage library (7 reusable stages) applies uniformly

## Ownership

`ai/workflows/*.workflow.ts` — 13 workflow definitions  
`ai/services/ai-service.ts` — facade (unchanged)
