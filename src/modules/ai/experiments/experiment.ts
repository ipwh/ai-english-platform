// ============================================
// Experiment Platform — Core Types
//
// All types for experiment configuration, variants,
// runs, metrics, and results. No runtime dependencies
// on other experiment modules.
// ============================================

import type { SemVer } from '../prompt-versioning/prompt-metadata';

// ── Experiment Configuration ──

/** Supported experiment types */
export type ExperimentType =
  | 'ab'            // A/B test (2 variants)
  | 'abc'           // A/B/C test (3 variants)
  | 'multi-variant'  // N variants
  | 'cross-provider' // Same prompt, different providers
  | 'cross-temperature' // Same prompt, different temperatures
  | 'cross-version'    // Different prompt versions
  | 'cross-dataset'    // Different evaluation datasets
  | 'cross-seed';      // Same prompt, different seeds

/** A single variant in an experiment */
export interface ExperimentVariant {
  /** Unique variant id (e.g. "A", "B", "C") */
  id: string;
  /** The prompt version to use (name@version) */
  promptVersion: string;
  /** Human-readable label */
  label: string;
  /** Optional description of what this variant tests */
  description?: string;
  /** If cross-provider, which provider this variant uses */
  provider?: string;
  /** If cross-temperature, which temperature this variant uses */
  temperature?: number;
}

/** Complete experiment configuration */
export interface ExperimentConfig {
  /** Unique experiment ID (slug, e.g. "reading-summary-v12") */
  id: string;
  /** Human-readable name */
  name: string;
  /** The prompt being tested */
  promptName: string;
  /** Experiment type */
  type: ExperimentType;
  /** Variants to compare */
  variants: ExperimentVariant[];
  /** Dataset fixture set to use */
  datasetId: string;
  /** Providers to test across */
  providers: string[];
  /** Temperatures to test */
  temperatures: number[];
  /** Seeds for reproducibility */
  seeds: number[];
  /** Number of repeat runs per variant per seed */
  repeatRuns: number;
  /** Optional: baseline variant id (defaults to first variant) */
  baselineVariantId?: string;
  /** Optional: minimum score difference to declare a winner (default 1.0) */
  winnerThreshold?: number;
  /** Optional: tags for categorization */
  tags?: string[];
  /** Optional: notes about the experiment */
  notes?: string;
}

// ── Metrics ──

/** Per-run metrics collected during an experiment */
export interface RunMetrics {
  /** Run index within the variant */
  runIndex: number;
  /** Seed used for this run */
  seed: number;
  /** Overall evaluation score (0-100) */
  overallScore: number;
  /** Rubric score (0-100) */
  rubricScore: number;
  /** Semantic score (0-100) */
  semanticScore: number;
  /** Structural score (0-100) */
  structuralScore: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Estimated cost in USD */
  costUsd: number;
  /** Prompt tokens used */
  promptTokens: number;
  /** Completion tokens used */
  completionTokens: number;
  /** Number of JSON repair attempts */
  jsonRepairCount: number;
  /** Provider that handled the request */
  provider: string;
  /** Model identifier used */
  model: string;
  /** Retry count (0 = first attempt succeeded) */
  retryCount: number;
  /** Whether this run failed */
  failed: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Timestamp of the run */
  timestamp: string;
}

// ── Variant Result ──

/** Aggregated results for a single variant */
export interface VariantResult {
  /** Variant id */
  variantId: string;
  /** Variant label */
  label: string;
  /** Prompt version tested */
  promptVersion: string;
  /** Total number of runs */
  totalRuns: number;
  /** Number of successful runs */
  successfulRuns: number;
  /** Number of failed runs */
  failedRuns: number;
  /** Success rate (0-1) */
  successRate: number;

  // Score statistics
  meanOverall: number;
  medianOverall: number;
  stdDevOverall: number;
  varianceOverall: number;
  p50Overall: number;
  p90Overall: number;
  p95Overall: number;
  minOverall: number;
  maxOverall: number;

  meanRubric: number;
  meanSemantic: number;
  meanStructural: number;

  // Cost & latency
  meanLatencyMs: number;
  medianLatencyMs: number;
  meanCostUsd: number;
  totalCostUsd: number;
  meanPromptTokens: number;
  meanCompletionTokens: number;
  meanJsonRepairCount: number;
  meanRetryCount: number;

  // Provider breakdown
  providerBreakdown: Record<string, {
    runs: number;
    meanOverall: number;
    meanLatencyMs: number;
  }>;

  // Per-seed breakdown
  seedBreakdown: Record<number, {
    runs: number;
    meanOverall: number;
    stdDevOverall: number;
  }>;

  /** All individual run metrics */
  runs: RunMetrics[];
}

// ── Experiment Result ──

/** Complete experiment result */
export interface ExperimentResult {
  /** Experiment config that produced this result */
  experimentId: string;
  /** Experiment name */
  experimentName: string;
  /** When the experiment was run */
  runAt: string;
  /** Git commit at time of experiment */
  gitCommit: string;
  /** Total duration of the experiment */
  totalDurationMs: number;

  /** Results per variant */
  variants: VariantResult[];

  /** Winner selection results */
  winner: WinnerResult | null;

  /** Confidence assessment */
  confidence: ConfidenceResult;

  /** Provider used for the experiment */
  provider: string;

  /** Dataset used */
  datasetId: string;

  /** Total runs across all variants */
  totalRuns: number;
}

// ── Winner ──

/** Winner selection result */
export interface WinnerResult {
  /** Winning variant id, or null if no significant winner */
  variantId: string | null;
  /** Winning variant label */
  label: string | null;
  /** Is the winner statistically significant? */
  isSignificant: boolean;
  /** Reason for the selection */
  reason: string;
  /** Score comparison between winner and runner-up */
  scoreDelta: number;
  /** Detailed breakdown of why this variant won */
  breakdown: WinnerBreakdown;
}

/** Detailed winner comparison */
export interface WinnerBreakdown {
  overall: { winner: number; runnerUp: number; delta: number };
  structural: { winner: number; runnerUp: number; delta: number };
  semantic: { winner: number; runnerUp: number; delta: number };
  rubric: { winner: number; runnerUp: number; delta: number };
  cost: { winner: number; runnerUp: number; delta: number };
  latency: { winner: number; runnerUp: number; delta: number };
}

// ── Confidence ──

/** Confidence assessment result */
export interface ConfidenceResult {
  /** Overall confidence score (0-100) */
  score: number;
  /** Confidence level as percentage string (e.g. "98%") */
  level: string;
  /** Confidence interval for overall score [lower, upper] */
  interval: [number, number];
  /** Is the result statistically significant? */
  isSignificant: boolean;
  /** Stability across seeds (0-100) */
  seedStability: number;
  /** Stability across providers (0-100) */
  providerStability: number;
  /** Stability across dataset items (0-100) */
  datasetStability: number;
  /** Variance across all runs */
  overallVariance: number;
  /** Per-variant confidence details */
  variantConfidence: Record<string, {
    mean: number;
    stdDev: number;
    confidenceInterval: [number, number];
  }>;
}

// ── Comparison ──

/** Head-to-head comparison of two variants */
export interface VariantComparison {
  variantA: string;
  variantB: string;
  /** Which variant won (or "tie") */
  winner: string;
  /** Score differences (positive = A wins, negative = B wins) */
  deltas: {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
    latency: number;
    cost: number;
  };
  /** Is the difference statistically significant? */
  significant: boolean;
  /** p-value if computed */
  pValue?: number;
}

// ── Provider Comparison ──

/** Comparison across providers for a variant */
export interface ProviderComparison {
  variantId: string;
  providers: Record<string, {
    meanOverall: number;
    meanLatencyMs: number;
    meanCostUsd: number;
    successRate: number;
    runs: number;
  }>;
}

// ── Analysis ──

/** Deep analysis result */
export interface ExperimentAnalysis {
  experimentId: string;
  /** Summary paragraph */
  summary: string;
  /** Key findings */
  findings: string[];
  /** Recommendations based on results */
  recommendations: string[];
  /** Risk assessment for promoting the winner */
  riskAssessment: RiskAssessment;
  /** Per-variant analysis */
  variantAnalysis: VariantAnalysis[];
  /** Provider analysis */
  providerAnalysis: ProviderAnalysis[];
  /** Sensitivity analysis */
  sensitivity: SensitivityAnalysis;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100, higher = more risky
  factors: string[];
}

export interface VariantAnalysis {
  variantId: string;
  strengths: string[];
  weaknesses: string[];
  scoreTrend: 'improving' | 'stable' | 'declining';
  outlierRate: number; // % of runs that are outliers
}

export interface ProviderAnalysis {
  provider: string;
  reliability: number; // 0-100
  avgLatency: number;
  costEfficiency: number; // score per dollar
  bestFor: string[];
}

export interface SensitivityAnalysis {
  /** How much scores change across seeds */
  seedSensitivity: number; // 0-100, lower = more stable
  /** How much scores change across temperatures */
  temperatureSensitivity: number;
  /** Minimum runs needed for statistical significance */
  minRunsForSignificance: number;
}

// ── Report ──

/** Experiment report configuration */
export interface ExperimentReportConfig {
  /** Include detailed per-run data */
  includeRunDetails?: boolean;
  /** Include provider breakdown */
  includeProviderBreakdown?: boolean;
  /** Include seed stability analysis */
  includeSeedAnalysis?: boolean;
  /** Include cost analysis */
  includeCostAnalysis?: boolean;
  /** Include recommendations */
  includeRecommendations?: boolean;
  /** Output format */
  format?: 'markdown' | 'json';
}

// ── Experiment Record ──

/** Persistent record of an experiment in the registry */
export interface ExperimentRecord {
  experimentId: string;
  config: ExperimentConfig;
  result?: ExperimentResult;
  status: ExperimentStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  gitCommit: string;
  tags?: string[];
}

export type ExperimentStatus =
  | 'draft'
  | 'running'
  | 'completed'
  | 'failed'
  | 'archived';
