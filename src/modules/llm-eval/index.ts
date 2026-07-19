// Sprint 28: LLM Evaluation Platform — barrel exports
export type {
  EvalMetrics, EvalRun, EvalReport, EvalHistory, EvalMetric,
  PromptBenchmark, ModelBenchmark, PromptVersionComparison, ProviderComparison,
} from './types';

export {
  runEval, runConsistencyEval,
  benchmarkPrompt, benchmarkModel, rankModels,
  comparePromptVersions, compareProviders,
  generateReport, getEvalHistory, clearEvalHistory,
  calcHallucinationRisk, calcConsistency, calcJsonValidity, calcRubricScore,
} from './services/eval-engine';
