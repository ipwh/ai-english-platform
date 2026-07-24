// Sprint 89: Generate Questions Workflow — registered with WorkflowRegistry
// Facade delegates to workflowEngine via this definition.

import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const GenerateQuestionsWorkflow = defineWorkflow({
  name: 'generate-questions',
  description: 'Generate DSE-aligned practice questions via AI',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 4096, timeoutMs: 25000 },
  tags: ['ai', 'questions', 'generation'],
});

// Auto-register on module load (idempotent)
workflowRegistry.register(GenerateQuestionsWorkflow);
