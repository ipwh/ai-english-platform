// Sprint 90: Writing Prompt Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const WritingPromptWorkflow = defineWorkflow({
  name: 'writing-prompt',
  description: 'Generate DSE writing prompts',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'writing', 'prompt'],
});
workflowRegistry.register(WritingPromptWorkflow);
