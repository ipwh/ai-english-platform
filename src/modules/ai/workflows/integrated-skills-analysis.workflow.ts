// Sprint 90: Integrated Skills Analysis Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const IntegratedSkillsAnalysisWorkflow = defineWorkflow({
  name: 'integrated-skills-analysis',
  description: 'Analyze DSE Integrated Skills responses',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 4096 },
  tags: ['ai', 'integrated', 'analysis', 'dse'],
});
workflowRegistry.register(IntegratedSkillsAnalysisWorkflow);
