// ============================================
// Experiment Platform — Barrel Export
// ============================================

export type {
  // Config
  ExperimentType, ExperimentConfig, ExperimentVariant,
  // Metrics
  RunMetrics,
  // Results
  VariantResult, ExperimentResult,
  // Winner
  WinnerResult, WinnerBreakdown,
  // Confidence
  ConfidenceResult,
  // Comparison
  VariantComparison, ProviderComparison,
  // Analysis
  ExperimentAnalysis, RiskAssessment,
  VariantAnalysis, ProviderAnalysis, SensitivityAnalysis,
  // Report
  ExperimentReportConfig,
  // Registry
  ExperimentRecord, ExperimentStatus,
} from './experiment';

// ── Statistics ──
export {
  mean, median, mode,
  variance, stdDev, range,
  percentile, p50, p90, p95,
  confidenceInterval95, confidenceInterval,
  cohensD, interpretCohensD,
  welchTTest,
  coefficientOfVariation, stabilityScore,
  detectOutliers,
} from './statistics';

// ── Confidence ──
export { computeConfidence } from './confidence';

// ── Winner Selection ──
export { selectWinner, rankVariants } from './winner-selection';

// ── Registry ──
export { experimentRegistry } from './experiment-registry';

// ── Runner ──
export { experimentRunner } from './experiment-runner';
export type { ExperimentProviderCall, ExperimentRunnerOptions, ExperimentFixture } from './experiment-runner';

// ── Result ──
export { aggregateResults, finalizeResult } from './experiment-result';

// ── Comparison ──
export {
  compareVariants, compareAllVariants,
  compareProvidersForVariant, compareAllProviders,
  scoreDistribution, compareAgainstBaseline,
} from './experiment-comparison';

// ── Analysis ──
export { analyzeExperiment } from './experiment-analysis';

// ── Report ──
export { generateReport } from './experiment-report';
