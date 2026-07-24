// Sprint 90: Analyze Material Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const AnalyzeMaterialWorkflow = defineWorkflow({
  name: 'analyze-material',
  description: 'Analyze educational materials with AI',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 4096 },
  tags: ['ai', 'material', 'analysis'],
});
workflowRegistry.register(AnalyzeMaterialWorkflow);
