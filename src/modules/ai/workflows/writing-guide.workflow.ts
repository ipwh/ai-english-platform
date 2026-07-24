// Sprint 90: Writing Guide Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const WritingGuideWorkflow = defineWorkflow({
  name: 'writing-guide',
  description: 'Generate DSE writing guides',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage] as any,
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'writing', 'guide'],
});
workflowRegistry.register(WritingGuideWorkflow);
