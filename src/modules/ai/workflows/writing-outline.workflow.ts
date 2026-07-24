// Sprint 90: Writing Outline Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const WritingOutlineWorkflow = defineWorkflow({
  name: 'writing-outline',
  description: 'Generate DSE writing outlines',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'writing', 'outline'],
});
workflowRegistry.register(WritingOutlineWorkflow);
