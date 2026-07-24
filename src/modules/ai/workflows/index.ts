// Sprint 87-90: AI Workflows — barrel exports
export type { WorkflowStage, StageResult } from './workflow-stage';
export type { WorkflowContext } from './workflow-context';
export type { WorkflowDefinition } from './workflow';
export { defineWorkflow } from './workflow';
export { workflowEngine } from './workflow-engine';
export type { WorkflowResult } from './workflow-engine';
export { workflowRegistry } from './workflow-registry';
export {
  ContextStage, ProviderStage, RetryStage, ParserStage,
  ValidationStage, MetricsStage, ResultStage,
} from './stages';

// All workflow definitions (auto-register on import)
export { GenerateQuestionsWorkflow } from './generate-questions.workflow';
export { AnalyzeAnswerWorkflow } from './analyze-answer.workflow';
export { AnalyzeWritingWorkflow } from './analyze-writing.workflow';
export { ExplainMistakeWorkflow } from './explain-mistake.workflow';
export { AnalyzeWordWorkflow } from './analyze-word.workflow';
export { AnalyzeProgressWorkflow } from './analyze-progress.workflow';
export { StudyHelpWorkflow } from './study-help.workflow';
export { AnalyzeMaterialWorkflow } from './analyze-material.workflow';
export { WritingPromptWorkflow } from './writing-prompt.workflow';
export { WritingOutlineWorkflow } from './writing-outline.workflow';
export { WritingGuideWorkflow } from './writing-guide.workflow';
export { IntegratedSkillsWorkflow } from './integrated-skills.workflow';
export { IntegratedSkillsAnalysisWorkflow } from './integrated-skills-analysis.workflow';
