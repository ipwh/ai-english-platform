// Sprint 28: LLM Evaluation Platform — types

export type EvalMetric = 'latency' | 'cost' | 'hallucination_risk' | 'consistency' | 'json_validity' | 'rubric_score';

export interface PromptBenchmark {
  promptId: string;
  promptName: string;
  version: string;
  provider: string;
  model: string;
  metrics: EvalMetrics;
  passed: boolean;
  issues: string[];
  timestamp: string;
}

export interface ModelBenchmark {
  modelId: string;
  modelName: string;
  provider: string;
  metrics: EvalMetrics;
  rank: number;
  strengths: string[];
  weaknesses: string[];
  timestamp: string;
}

export interface PromptVersionComparison {
  baselineId: string;
  candidateId: string;
  baselineVersion: string;
  candidateVersion: string;
  metricsDiff: Record<EvalMetric, { before: number; after: number; change: number; improved: boolean }>;
  winner: string;
  confidence: number;
}

export interface ProviderComparison {
  providers: string[];
  metrics: Record<string, EvalMetrics>;
  rankings: Array<{ provider: string; overallScore: number; rank: number }>;
  bestFor: Record<string, string>;  // metric → best provider
  timestamp: string;
}

export interface EvalMetrics {
  latencyMs: number;
  costUsd: number;
  hallucinationRisk: number;     // 0-1, lower is better
  consistency: number;            // 0-1, higher is better
  jsonValidity: number;           // 0-1, higher is better
  rubricScore: number;            // 0-100, higher is better
}

export interface EvalReport {
  id: string;
  title: string;
  generatedAt: string;
  type: 'prompt-benchmark' | 'model-benchmark' | 'version-comparison' | 'provider-comparison';
  summary: string;
  summaryZh: string;
  results: EvalRun[];
  recommendations: string[];
  recommendationsZh: string[];
}

export interface EvalRun {
  runId: string;
  input: string;
  expectedOutput?: string;
  metrics: EvalMetrics;
  rawOutput: string;
  durationMs: number;
  error?: string;
}

export interface EvalHistory {
  runs: EvalRun[];
  reports: EvalReport[];
  totalRuns: number;
  averageMetrics: EvalMetrics;
}
