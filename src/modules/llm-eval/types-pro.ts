// Sprint 41: AI Evaluation Platform Pro — types
export interface EvalRunInput {
  runId: string;
  promptVersion: string;
  modelProvider: string;
  modelName: string;
  input: string;
  output: string;
  expectedOutput?: string;
  latencyMs: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
}

export interface EvalMetrics {
  runId: string;
  timestamp: string;
  latencyMs: number;
  costUsd: number;
  consistency: number;
  jsonValidity: number;
  hallucinationRisk: number;
  rubricAccuracy: number;
  overallScore: number;
}

export interface ProviderMetrics {
  provider: string;
  model: string;
  totalRuns: number;
  avgLatency: number;
  avgCost: number;
  avgConsistency: number;
  avgJsonValidity: number;
  avgHallucinationRisk: number;
  avgRubricAccuracy: number;
  overallScore: number;
  reliability: number; // % successful runs
}

export interface ABTestResult {
  testId: string;
  promptVersionA: string;
  promptVersionB: string;
  modelProvider: string;
  sampleSize: number;
  metrics: {
    versionA: ABTestMetrics;
    versionB: ABTestMetrics;
  };
  winner: 'A' | 'B' | 'tie';
  confidence: number;
  recommendation: string;
  recommendationZh: string;
  detailedComparison: Array<{
    metric: string;
    a: number;
    b: number;
    difference: number;
    significant: boolean;
  }>;
}

export interface ABTestMetrics {
  avgScore: number;
  consistency: number;
  jsonValidity: number;
  hallucinationRisk: number;
  rubricAccuracy: number;
  avgLatency: number;
  avgCost: number;
}

export interface EvalReport {
  reportId: string;
  generatedAt: string;
  period: { start: string; end: string };
  overview: {
    totalRuns: number;
    activeProviders: number;
    activeModels: number;
    averageOverallScore: number;
    totalCost: number;
  };
  providerRankings: ProviderMetrics[];
  trendAnalysis: {
    scoreTrend: string;
    latencyTrend: string;
    costTrend: string;
  };
  abTests: ABTestResult[];
  recommendations: string[];
  recommendationsZh: string[];
}

export interface EvalHistoryEntry {
  id: string;
  runId: string;
  promptVersion: string;
  modelProvider: string;
  metrics: EvalMetrics;
  createdAt: string;
}

export interface FeedbackQualityMetrics {
  relevance: number;
  accuracy: number;
  helpfulness: number;
  specificity: number;
  actionability: number;
  overall: number;
}

export interface RecommendationQualityMetrics {
  appropriateness: number;
  diversity: number;
  personalization: number;
  feasibility: number;
  overall: number;
}

export interface LearningGainMetrics {
  preScore: number;
  postScore: number;
  gain: number;
  normalizedGain: number;
  effectSize: number;
}
