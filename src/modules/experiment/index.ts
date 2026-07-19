// Sprint 42: AI Experiment Platform — barrel exports
export type {
  ExperimentType, ExperimentStatus, ABWinner,
  ExperimentConfig, PersistentExperiment,
  TestCase,
  PromptVariant, VariantResult, PromptExperimentConfig, PromptExperimentResult,
  ModelConfig, ModelResult, ModelRanking, ModelExperimentConfig, ModelExperimentResult,
  TemperatureResult, TemperatureExperimentConfig, TemperatureExperimentResult,
  LearningGroup, GroupResult, LearningGainComparison, MasteryImprovementComparison,
  LearningExperimentConfig, LearningExperimentResult,
  ABComparison, ComparisonMetrics,
  CostComparison, CostBreakdown,
  ExperimentReport, ReportSummary, SuccessMetrics, RecommendationReport,
  CreatePromptExperimentInput, CreateModelExperimentInput,
  CreateTemperatureExperimentInput, CreateLearningExperimentInput,
  ABTestInput,
} from './types';

export { experimentService, ExperimentService } from './services/experiment-engine';
