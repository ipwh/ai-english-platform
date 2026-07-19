// Sprint 42: AI Experiment Platform — types
// ============================================
// Core experiment types
// ============================================

export type ExperimentType = 'prompt' | 'model' | 'temperature' | 'learning';
export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'cancelled';
export type ABWinner = 'A' | 'B' | 'tie';

// ============================================
// Experiment Configuration
// ============================================

export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  type: ExperimentType;
  status: ExperimentStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  featureFlag: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Test Cases
// ============================================

export interface TestCase {
  id: string;
  input: string;
  expectedOutput?: string;
  tags?: string[];
}

// ============================================
// Prompt Experiment
// ============================================

export interface PromptVariant {
  name: string;
  version: string;
  prompt: string;
  modelProvider: string;
  modelName: string;
  temperature: number;
  description?: string;
}

export interface VariantResult {
  variantName: string;
  avgScore: number;
  avgLatency: number;
  avgCost: number;
  consistency: number;
  hallucinationRisk: number;
  rubricAccuracy: number;
  sampleSize: number;
}

export interface PromptExperimentConfig extends ExperimentConfig {
  type: 'prompt';
  variants: PromptVariant[];
  testCases: TestCase[];
}

export interface PromptExperimentResult {
  experimentId: string;
  variantResults: VariantResult[];
  winner: string | null;
  confidence: number;
  abComparison: ABComparison | null;
  completedAt: string;
}

// ============================================
// Model Experiment
// ============================================

export interface ModelConfig {
  provider: string;
  modelName: string;
  temperature: number;
  maxTokens?: number;
}

export interface ModelResult {
  provider: string;
  modelName: string;
  avgScore: number;
  avgLatency: number;
  avgCost: number;
  consistency: number;
  hallucinationRisk: number;
  rubricAccuracy: number;
  sampleSize: number;
}

export interface ModelRanking {
  provider: string;
  modelName: string;
  rank: number;
  overallScore: number;
  costPerRun: number;
}

export interface ModelExperimentConfig extends ExperimentConfig {
  type: 'model';
  models: ModelConfig[];
  testCases: TestCase[];
}

export interface ModelExperimentResult {
  experimentId: string;
  modelResults: ModelResult[];
  winner: string | null;
  confidence: number;
  rankings: ModelRanking[];
  completedAt: string;
}

// ============================================
// Temperature Experiment
// ============================================

export interface TemperatureResult {
  temperature: number;
  avgScore: number;
  avgCreativity: number;
  avgCoherence: number;
  avgLatency: number;
  avgCost: number;
  sampleSize: number;
}

export interface TemperatureExperimentConfig extends ExperimentConfig {
  type: 'temperature';
  modelProvider: string;
  modelName: string;
  temperatures: number[];
  testCases: TestCase[];
}

export interface TemperatureExperimentResult {
  experimentId: string;
  tempResults: TemperatureResult[];
  optimalTemperature: number;
  recommendations: string;
  recommendationsZh: string;
  completedAt: string;
}

// ============================================
// Learning Experiment
// ============================================

export interface LearningGroup {
  name: string;
  condition: string;
  studentIds: string[];
  intervention: string;
}

export interface GroupResult {
  groupName: string;
  preAvg: number;
  postAvg: number;
  gain: number;
  normalizedGain: number;
  effectSize: number;
  masteryImprovement: number;
  sampleSize: number;
}

export interface LearningGainComparison {
  bestGroup: string;
  bestGain: number;
  comparisonTable: Array<{
    group: string;
    avgGain: number;
    normalizedGain: number;
    effectSize: number;
    significant: boolean;
  }>;
}

export interface MasteryImprovementComparison {
  bestGroup: string;
  bestImprovement: number;
  comparisonTable: Array<{
    group: string;
    masteryPre: number;
    masteryPost: number;
    improvement: number;
    significant: boolean;
  }>;
}

export interface LearningExperimentConfig extends ExperimentConfig {
  type: 'learning';
  groups: LearningGroup[];
  preTestId: string;
  postTestId: string;
  duration: string;
}

export interface LearningExperimentResult {
  experimentId: string;
  groupResults: GroupResult[];
  winner: string | null;
  confidence: number;
  learningGain: LearningGainComparison;
  masteryImprovement: MasteryImprovementComparison;
  recommendations: string;
  recommendationsZh: string;
  completedAt: string;
}

// ============================================
// A/B Comparison (used across experiment types)
// ============================================

export interface ComparisonMetrics {
  avgScore: number;
  avgLatency: number;
  avgCost: number;
  consistency: number;
  hallucinationRisk: number;
}

export interface ABComparison {
  nameA: string;
  nameB: string;
  metricsA: ComparisonMetrics;
  metricsB: ComparisonMetrics;
  winner: ABWinner;
  confidence: number;
  pValue: number;
  effectSize: number;
  recommendation: string;
  recommendationZh: string;
}

// ============================================
// Cost Comparison
// ============================================

export interface CostBreakdown {
  name: string;
  totalCost: number;
  avgCostPerRun: number;
  totalRuns: number;
  costRank: number;
}

export interface CostComparison {
  experimentId: string;
  variants: CostBreakdown[];
  cheapest: string;
  mostExpensive: string;
  costPerRunDiff: number;
  recommendation: string;
  recommendationZh: string;
}

// ============================================
// Experiment Reports
// ============================================

export interface ReportSummary {
  totalVariants: number;
  totalRuns: number;
  totalCost: number;
  winner: string | null;
  confidence: number;
  experimentDuration: string;
}

export interface SuccessMetrics {
  experimentSuccess: boolean;
  confidenceScore: number;
  costEfficiency: number;
  timeEfficiency: number;
  recommendationQuality: number;
  overallScore: number;
}

export interface ExperimentReport {
  reportId: string;
  experimentId: string;
  experimentName: string;
  experimentType: ExperimentType;
  generatedAt: string;
  status: ExperimentStatus;
  summary: ReportSummary;
  successMetrics: SuccessMetrics;
  recommendations: string[];
  recommendationsZh: string[];
}

export interface RecommendationReport {
  reportId: string;
  experimentId: string;
  generatedAt: string;
  topPicks: Array<{
    rank: number;
    name: string;
    score: number;
    reason: string;
    reasonZh: string;
  }>;
  actionItems: string[];
  actionItemsZh: string[];
  costAnalysis: CostBreakdown[];
  riskFactors: string[];
  riskFactorsZh: string[];
}

// ============================================
// Persistence
// ============================================

export interface PersistentExperiment {
  config: ExperimentConfig;
  result?: PromptExperimentResult | ModelExperimentResult | TemperatureExperimentResult | LearningExperimentResult;
  report?: ExperimentReport;
  recommendationReport?: RecommendationReport;
  costComparison?: CostComparison;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API Input Types
// ============================================

export interface CreatePromptExperimentInput {
  name: string;
  description: string;
  variants: PromptVariant[];
  testCases: TestCase[];
}

export interface CreateModelExperimentInput {
  name: string;
  description: string;
  models: ModelConfig[];
  testCases: TestCase[];
}

export interface CreateTemperatureExperimentInput {
  name: string;
  description: string;
  modelProvider: string;
  modelName: string;
  temperatures: number[];
  testCases: TestCase[];
}

export interface CreateLearningExperimentInput {
  name: string;
  description: string;
  groups: LearningGroup[];
  preTestId: string;
  postTestId: string;
  duration: string;
}

export interface ABTestInput {
  testId: string;
  nameA: string;
  nameB: string;
  scoresA: number[];
  scoresB: number[];
  latencyA: number[];
  latencyB: number[];
  costA: number[];
  costB: number[];
}
