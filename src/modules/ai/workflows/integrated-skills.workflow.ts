// Sprint 90: Integrated Skills Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const IntegratedSkillsWorkflow = defineWorkflow({
  name: 'integrated-skills',
  description: 'Generate DSE Integrated Skills tasks',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage] as any,
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 4096 },
  tags: ['ai', 'integrated', 'skills', 'dse'],
});
workflowRegistry.register(IntegratedSkillsWorkflow);
