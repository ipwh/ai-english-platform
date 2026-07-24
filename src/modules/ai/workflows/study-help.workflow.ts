// Sprint 90: Study Help Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const StudyHelpWorkflow = defineWorkflow({
  name: 'study-help',
  description: 'AI-powered study help and tutoring',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage] as any,
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 4096 },
  tags: ['ai', 'help', 'tutoring'],
});
workflowRegistry.register(StudyHelpWorkflow);
