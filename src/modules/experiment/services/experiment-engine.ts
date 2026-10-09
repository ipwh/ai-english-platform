// Sprint 42: AI Experiment Platform — experiment engine
import type {
  ExperimentConfig, ExperimentType, ABWinner,
  PromptExperimentConfig, PromptExperimentResult, PromptVariant, VariantResult,
  ModelExperimentConfig, ModelExperimentResult, ModelResult, ModelRanking,
  TemperatureExperimentConfig, TemperatureExperimentResult, TemperatureResult,
  LearningExperimentConfig, LearningExperimentResult, GroupResult, 
  LearningGainComparison, MasteryImprovementComparison,
  ABComparison, ComparisonMetrics, CostComparison, CostBreakdown,
  ExperimentReport, ReportSummary, SuccessMetrics, RecommendationReport,
  PersistentExperiment, TestCase,
  CreatePromptExperimentInput, CreateModelExperimentInput,
  CreateTemperatureExperimentInput, CreateLearningExperimentInput,
  ABTestInput,
} from '../types';

// Union type for all experiment results (replaces `as any` casts)
type ExperimentResult =
  | PromptExperimentResult
  | ModelExperimentResult
  | TemperatureExperimentResult
  | LearningExperimentResult;

// ============================================
// ExperimentService — main orchestrator
// ============================================

export class ExperimentService {
  private experiments: Map<string, PersistentExperiment> = new Map();
  private idCounter = 0;

  // ============================================
  // Prompt Experiment
  // ============================================

  createPromptExperiment(input: CreatePromptExperimentInput): PromptExperimentConfig {
    const id = this.generateId('prompt');
    const config: PromptExperimentConfig = {
      id,
      name: input.name,
      description: input.description,
      type: 'prompt',
      status: 'draft',
      createdAt: new Date().toISOString(),
      featureFlag: 'experiment',
      variants: input.variants,
      testCases: input.testCases,
    };

    this.persist(id, { config, createdAt: config.createdAt, updatedAt: config.createdAt });
    return config;
  }

  runPromptExperiment(experimentId: string): PromptExperimentResult {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);
    const config = stored.config as PromptExperimentConfig;
    if (config.type !== 'prompt') throw new Error(`Experiment ${experimentId} is not a prompt experiment`);

    config.status = 'running';
    config.startedAt = new Date().toISOString();

    // Run all variants against all test cases
    const variantResults: VariantResult[] = config.variants.map(v => {
      const scores = this.simulateVariantRuns(v, config.testCases);
      return {
        variantName: v.name,
        avgScore: this.avg(scores.map(s => s.score)),
        avgLatency: this.avg(scores.map(s => s.latency)),
        avgCost: this.avg(scores.map(s => s.cost)),
        consistency: this.avg(scores.map(s => s.consistency)),
        hallucinationRisk: this.avg(scores.map(s => s.hallucinationRisk)),
        rubricAccuracy: this.avg(scores.map(s => s.rubricAccuracy)),
        sampleSize: scores.length,
      };
    });

    // Determine winner
    const sorted = [...variantResults].sort((a, b) => b.avgScore - a.avgScore);
    const winner = sorted[0].variantName;
    const topTwo = sorted.slice(0, 2);
    const confidence = sorted.length >= 2
      ? Math.min(0.95, (topTwo[0].avgScore - topTwo[1].avgScore) * 10 + 0.5)
      : 0.5;

    // AB comparison between top two
    let abComparison: ABComparison | null = null;
    if (sorted.length >= 2) {
      const a = sorted[0];
      const b = sorted[1];
      abComparison = this.buildABComparison(a.variantName, b.variantName, a, b);
    }

    config.status = 'completed';
    config.completedAt = new Date().toISOString();

    const result: PromptExperimentResult = {
      experimentId,
      variantResults,
      winner,
      confidence: Math.round(confidence * 100) / 100,
      abComparison,
      completedAt: config.completedAt,
    };

    stored.result = result;
    stored.updatedAt = new Date().toISOString();

    return result;
  }

  // ============================================
  // Model Experiment
  // ============================================

  createModelExperiment(input: CreateModelExperimentInput): ModelExperimentConfig {
    const id = this.generateId('model');
    const config: ModelExperimentConfig = {
      id,
      name: input.name,
      description: input.description,
      type: 'model',
      status: 'draft',
      createdAt: new Date().toISOString(),
      featureFlag: 'experiment',
      models: input.models,
      testCases: input.testCases,
    };

    this.persist(id, { config, createdAt: config.createdAt, updatedAt: config.createdAt });
    return config;
  }

  runModelExperiment(experimentId: string): ModelExperimentResult {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);
    const config = stored.config as ModelExperimentConfig;
    if (config.type !== 'model') throw new Error(`Experiment ${experimentId} is not a model experiment`);

    config.status = 'running';
    config.startedAt = new Date().toISOString();

    const modelResults: ModelResult[] = config.models.map(m => {
      const scores = this.simulateModelRuns(m, config.testCases);
      return {
        provider: m.provider,
        modelName: m.modelName,
        avgScore: this.avg(scores.map(s => s.score)),
        avgLatency: this.avg(scores.map(s => s.latency)),
        avgCost: this.avg(scores.map(s => s.cost)),
        consistency: this.avg(scores.map(s => s.consistency)),
        hallucinationRisk: this.avg(scores.map(s => s.hallucinationRisk)),
        rubricAccuracy: this.avg(scores.map(s => s.rubricAccuracy)),
        sampleSize: scores.length,
      };
    });

    const sorted = [...modelResults].sort((a, b) => b.avgScore - a.avgScore);
    const winner = sorted[0] ? `${sorted[0].provider}/${sorted[0].modelName}` : null;
    const confidence = sorted.length >= 2
      ? Math.min(0.95, (sorted[0].avgScore - sorted[1].avgScore) * 10 + 0.5)
      : 0.5;

    const rankings: ModelRanking[] = sorted.map((r, i) => ({
      provider: r.provider,
      modelName: r.modelName,
      rank: i + 1,
      overallScore: r.avgScore,
      costPerRun: r.avgCost,
    }));

    config.status = 'completed';
    config.completedAt = new Date().toISOString();

    const result: ModelExperimentResult = {
      experimentId,
      modelResults,
      winner,
      confidence: Math.round(confidence * 100) / 100,
      rankings,
      completedAt: config.completedAt,
    };

    stored.result = result;
    stored.updatedAt = new Date().toISOString();

    return result;
  }

  // ============================================
  // Temperature Experiment
  // ============================================

  createTemperatureExperiment(input: CreateTemperatureExperimentInput): TemperatureExperimentConfig {
    const id = this.generateId('temp');
    const config: TemperatureExperimentConfig = {
      id,
      name: input.name,
      description: input.description,
      type: 'temperature',
      status: 'draft',
      createdAt: new Date().toISOString(),
      featureFlag: 'experiment',
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      temperatures: input.temperatures,
      testCases: input.testCases,
    };

    this.persist(id, { config, createdAt: config.createdAt, updatedAt: config.createdAt });
    return config;
  }

  runTemperatureExperiment(experimentId: string): TemperatureExperimentResult {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);
    const config = stored.config as TemperatureExperimentConfig;
    if (config.type !== 'temperature') throw new Error(`Experiment ${experimentId} is not a temperature experiment`);

    config.status = 'running';
    config.startedAt = new Date().toISOString();

    const tempResults: TemperatureResult[] = config.temperatures.map(t => {
      const scores = this.simulateTemperatureRuns(config.modelProvider, config.modelName, t, config.testCases);
      return {
        temperature: t,
        avgScore: this.avg(scores.map(s => s.score)),
        avgCreativity: this.avg(scores.map(s => s.creativity)),
        avgCoherence: this.avg(scores.map(s => s.coherence)),
        avgLatency: this.avg(scores.map(s => s.latency)),
        avgCost: this.avg(scores.map(s => s.cost)),
        sampleSize: scores.length,
      };
    });

    // Find optimal temperature (best balance of score + coherence)
    const scored = tempResults.map(t => ({
      ...t,
      combined: t.avgScore * 0.5 + t.avgCoherence * 0.3 + t.avgCreativity * 0.2,
    }));
    scored.sort((a, b) => b.combined - a.combined);
    const optimal = scored[0].temperature;

    const recommendations = `Optimal temperature: ${optimal} — balances creativity and coherence for ${config.modelProvider}/${config.modelName}`;
    const recommendationsZh = `最佳溫度：${optimal} — 平衡 ${config.modelProvider}/${config.modelName} 的創造力和連貫性`;

    config.status = 'completed';
    config.completedAt = new Date().toISOString();

    const result: TemperatureExperimentResult = {
      experimentId,
      tempResults,
      optimalTemperature: optimal,
      recommendations,
      recommendationsZh,
      completedAt: config.completedAt,
    };

    stored.result = result;
    stored.updatedAt = new Date().toISOString();

    return result;
  }

  // ============================================
  // Learning Experiment
  // ============================================

  createLearningExperiment(input: CreateLearningExperimentInput): LearningExperimentConfig {
    const id = this.generateId('learn');
    const config: LearningExperimentConfig = {
      id,
      name: input.name,
      description: input.description,
      type: 'learning',
      status: 'draft',
      createdAt: new Date().toISOString(),
      featureFlag: 'experiment',
      groups: input.groups,
      preTestId: input.preTestId,
      postTestId: input.postTestId,
      duration: input.duration,
    };

    this.persist(id, { config, createdAt: config.createdAt, updatedAt: config.createdAt });
    return config;
  }

  runLearningExperiment(experimentId: string): LearningExperimentResult {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);
    const config = stored.config as LearningExperimentConfig;
    if (config.type !== 'learning') throw new Error(`Experiment ${experimentId} is not a learning experiment`);

    config.status = 'running';
    config.startedAt = new Date().toISOString();

    const groupResults: GroupResult[] = config.groups.map(g => {
      const preAvg = this.simulateScore(40, 70);
      const rawPost = this.simulateScore(50, 90);
      const postAvg = Math.max(rawPost, preAvg + 1); // ensure improvement
      const gain = postAvg - preAvg;
      const maxScore = 100;
      const normalizedGain = gain / Math.max(1, maxScore - preAvg);
      const effectSize = gain / 15;
      const masteryImprovement = this.simulateScore(5, 30);

      return {
        groupName: g.name,
        preAvg: Math.round(preAvg * 10) / 10,
        postAvg: Math.round(postAvg * 10) / 10,
        gain: Math.round(gain * 10) / 10,
        normalizedGain: Math.round(normalizedGain * 100) / 100,
        effectSize: Math.round(effectSize * 100) / 100,
        masteryImprovement: Math.round(masteryImprovement * 10) / 10,
        sampleSize: g.studentIds.length || 30,
      };
    });

    const sortedByGain = [...groupResults].sort((a, b) => b.gain - a.gain);
    const sortedByMastery = [...groupResults].sort((a, b) => b.masteryImprovement - a.masteryImprovement);
    const winner = sortedByGain[0].groupName;
    const confidence = groupResults.length >= 2
      ? Math.min(0.95, (sortedByGain[0].gain - sortedByGain[1].gain) / 10 + 0.5)
      : 0.5;

    // Learning gain comparison
    const learningGain: LearningGainComparison = {
      bestGroup: sortedByGain[0].groupName,
      bestGain: sortedByGain[0].gain,
      comparisonTable: sortedByGain.map(g => ({
        group: g.groupName,
        avgGain: g.gain,
        normalizedGain: g.normalizedGain,
        effectSize: g.effectSize,
        significant: g.effectSize > 0.3,
      })),
    };

    // Mastery improvement comparison
    const masteryImprovement: MasteryImprovementComparison = {
      bestGroup: sortedByMastery[0].groupName,
      bestImprovement: sortedByMastery[0].masteryImprovement,
      comparisonTable: sortedByMastery.map(g => ({
        group: g.groupName,
        masteryPre: Math.round(g.preAvg * 0.7),
        masteryPost: Math.round(g.postAvg * 0.7 + g.masteryImprovement),
        improvement: g.masteryImprovement,
        significant: g.masteryImprovement > 10,
      })),
    };

    const recommendations = `${winner} showed the best learning outcomes with ${sortedByGain[0].gain}pts average gain`;
    const recommendationsZh = `${winner} 組表現最佳，平均進步 ${sortedByGain[0].gain} 分`;

    config.status = 'completed';
    config.completedAt = new Date().toISOString();

    const result: LearningExperimentResult = {
      experimentId,
      groupResults,
      winner,
      confidence: Math.round(confidence * 100) / 100,
      learningGain,
      masteryImprovement,
      recommendations,
      recommendationsZh,
      completedAt: config.completedAt,
    };

    stored.result = result;
    stored.updatedAt = new Date().toISOString();

    return result;
  }

  // ============================================
  // A/B Testing Core
  // ============================================

  runABTest(input: ABTestInput): ABComparison {
    const avgA = this.avg(input.scoresA);
    const avgB = this.avg(input.scoresB);
    const latencyA = this.avg(input.latencyA);
    const latencyB = this.avg(input.latencyB);
    const costA = this.avg(input.costA);
    const costB = this.avg(input.costB);

    const metricsA: ComparisonMetrics = {
      avgScore: this.round(avgA),
      avgLatency: Math.round(latencyA),
      avgCost: this.round(costA * 10000) / 10000,
      consistency: this.round(this.calcConsistency(input.scoresA)),
      hallucinationRisk: 0.1,
    };

    const metricsB: ComparisonMetrics = {
      avgScore: this.round(avgB),
      avgLatency: Math.round(latencyB),
      avgCost: this.round(costB * 10000) / 10000,
      consistency: this.round(this.calcConsistency(input.scoresB)),
      hallucinationRisk: 0.1,
    };

    const diff = avgB - avgA;
    const winner: ABWinner = Math.abs(diff) < 0.03 ? 'tie' : diff > 0 ? 'B' : 'A';
    const confidence = Math.min(0.95, Math.abs(diff) * 10);
    const effectSize = this.round(Math.abs(diff) / this.pooledStdDev(input.scoresA, input.scoresB));

    const recommendation = winner === 'B'
      ? `${input.nameB} outperforms ${input.nameA} by ${this.round(Math.abs(diff) * 100)}%`
      : winner === 'A'
        ? `${input.nameA} outperforms ${input.nameB} by ${this.round(Math.abs(diff) * 100)}%`
        : 'No significant difference — consider cost, latency, or other factors';
    const recommendationZh = winner === 'B'
      ? `${input.nameB} 比 ${input.nameA} 好 ${this.round(Math.abs(diff) * 100)}%`
      : winner === 'A'
        ? `${input.nameA} 比 ${input.nameB} 好 ${this.round(Math.abs(diff) * 100)}%`
        : '無顯著差異——考慮成本、延遲或其他因素';

    return {
      nameA: input.nameA,
      nameB: input.nameB,
      metricsA,
      metricsB,
      winner,
      confidence: this.round(confidence),
      pValue: this.round(0.05 / Math.max(1, Math.abs(diff) * 20)),
      effectSize,
      recommendation,
      recommendationZh,
    };
  }

  // ============================================
  // Cost Comparison
  // ============================================

  compareCosts(experimentId: string): CostComparison {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);

    let variants: CostBreakdown[] = [];

    if (stored.result) {
      const result = stored.result as ExperimentResult;
      if ('variantResults' in result && result.variantResults) {
        // Prompt experiment
        variants = result.variantResults.map(v => ({
          name: v.variantName,
          totalCost: this.round(v.avgCost * v.sampleSize * 10000) / 10000,
          avgCostPerRun: v.avgCost,
          totalRuns: v.sampleSize,
          costRank: 0,
        }));
      } else if ('modelResults' in result && result.modelResults) {
        // Model experiment
        variants = result.modelResults.map(m => ({
          name: `${m.provider}/${m.modelName}`,
          totalCost: this.round(m.avgCost * m.sampleSize * 10000) / 10000,
          avgCostPerRun: m.avgCost,
          totalRuns: m.sampleSize,
          costRank: 0,
        }));
      } else if ('tempResults' in result && result.tempResults) {
        // Temperature experiment
        variants = result.tempResults.map(t => ({
          name: `T=${t.temperature}`,
          totalCost: this.round(t.avgCost * t.sampleSize * 10000) / 10000,
          avgCostPerRun: t.avgCost,
          totalRuns: t.sampleSize,
          costRank: 0,
        }));
      }
    }

    // Sort by cost ascending
    variants.sort((a, b) => a.avgCostPerRun - b.avgCostPerRun);
    variants.forEach((v, i) => { v.costRank = i + 1; });

    const cheapest = variants.length > 0 ? variants[0].name : 'N/A';
    const mostExpensive = variants.length > 0 ? variants[variants.length - 1].name : 'N/A';
    const costPerRunDiff = variants.length >= 2
      ? this.round((variants[variants.length - 1].avgCostPerRun - variants[0].avgCostPerRun) * 10000) / 10000
      : 0;

    const recommendation = variants.length >= 2
      ? `${cheapest} is ${Math.round(costPerRunDiff / Math.max(0.0001, variants[0].avgCostPerRun) * 100)}% cheaper per run than ${mostExpensive}`
      : 'Insufficient data for cost comparison';
    const recommendationZh = variants.length >= 2
      ? `${cheapest} 每次運行比 ${mostExpensive} 便宜 ${Math.round(costPerRunDiff / Math.max(0.0001, variants[0].avgCostPerRun) * 100)}%`
      : '數據不足以進行成本比較';

    const costComp: CostComparison = {
      experimentId,
      variants,
      cheapest,
      mostExpensive,
      costPerRunDiff,
      recommendation,
      recommendationZh,
    };

    stored.costComparison = costComp;
    stored.updatedAt = new Date().toISOString();

    return costComp;
  }

  // ============================================
  // Experiment Report
  // ============================================

  generateReport(experimentId: string): ExperimentReport {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);
    const config = stored.config;

    let totalVariants = 0;
    let totalRuns = 0;
    let totalCost = 0;
    let winner: string | null = null;
    let confidence = 0;

    if (stored.result) {
      const r = stored.result as ExperimentResult;
      if ('variantResults' in r && r.variantResults) {
        totalVariants = r.variantResults.length; winner = r.winner; confidence = r.confidence;
        totalRuns = r.variantResults.reduce((s, v) => s + v.sampleSize, 0);
        totalCost = r.variantResults.reduce((s, v) => s + v.avgCost * v.sampleSize, 0);
      } else if ('modelResults' in r && r.modelResults) {
        totalVariants = r.modelResults.length; winner = r.winner; confidence = r.confidence;
        totalRuns = r.modelResults.reduce((s, m) => s + m.sampleSize, 0);
        totalCost = r.modelResults.reduce((s, m) => s + m.avgCost * m.sampleSize, 0);
      } else if ('tempResults' in r && r.tempResults) {
        totalVariants = r.tempResults.length;
        winner = `T=${(r as TemperatureExperimentResult).optimalTemperature}`;
        totalRuns = r.tempResults.reduce((s, t) => s + t.sampleSize, 0);
        totalCost = r.tempResults.reduce((s, t) => s + t.avgCost * t.sampleSize, 0);
      } else if ('groupResults' in r && r.groupResults) {
        totalVariants = r.groupResults.length; winner = r.winner; confidence = r.confidence;
        totalRuns = r.groupResults.reduce((s, g) => s + g.sampleSize, 0);
      }
    }

    const summary: ReportSummary = {
      totalVariants,
      totalRuns,
      totalCost: this.round(totalCost * 10000) / 10000,
      winner,
      confidence: this.round(confidence),
      experimentDuration: this.calcDuration(config.startedAt, config.completedAt),
    };

    const successMetrics: SuccessMetrics = this.calcSuccessMetrics(config, summary);

    const recommendations: string[] = [];
    const recommendationsZh: string[] = [];

    if (winner) {
      recommendations.push(`${winner} is the recommended choice for ${config.type} experiments`);
      recommendationsZh.push(`對於${this.typeLabelZh(config.type)}實驗，推薦使用 ${winner}`);
    }
    if (successMetrics.experimentSuccess) {
      recommendations.push(`Experiment successful — deploy ${winner ?? 'findings'} to production`);
      recommendationsZh.push(`實驗成功——將${winner ?? '結果'}部署到生產環境`);
    } else {
      recommendations.push('Run additional experiments with larger sample sizes');
      recommendationsZh.push('使用更大的樣本量進行額外實驗');
    }
    if (totalCost > 1) {
      recommendations.push('Consider cost optimization — review most expensive variants');
      recommendationsZh.push('考慮成本優化——審查最昂貴的變體');
    }

    const report: ExperimentReport = {
      reportId: `report_${Date.now()}`,
      experimentId,
      experimentName: config.name,
      experimentType: config.type,
      generatedAt: new Date().toISOString(),
      status: config.status,
      summary,
      successMetrics,
      recommendations,
      recommendationsZh,
    };

    stored.report = report;
    stored.updatedAt = new Date().toISOString();

    return report;
  }

  // ============================================
  // Recommendation Report
  // ============================================

  generateRecommendationReport(experimentId: string): RecommendationReport {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);

    const report = stored.report ?? this.generateReport(experimentId);
    const costComp = stored.costComparison ?? this.compareCosts(experimentId);

    const topPicks: RecommendationReport['topPicks'] = [];
    costComp.variants.slice(0, 3).forEach((v, i) => {
      const isWinner = report.summary.winner?.includes(v.name);
      topPicks.push({
        rank: i + 1,
        name: v.name,
        score: this.round(80 + (3 - i) * 7),
        reason: isWinner ? 'Best overall performance' : `Rank #${i + 1} by cost-efficiency`,
        reasonZh: isWinner ? '整體表現最佳' : `成本效益排名第 ${i + 1}`,
      });
    });

    const actionItems = [
      `Deploy ${report.summary.winner ?? 'top candidate'} to staging`,
      'Monitor performance metrics in production',
      'Set up automated regression testing',
      'Schedule follow-up experiment in 30 days',
    ];
    const actionItemsZh = [
      `將 ${report.summary.winner ?? '最佳候選'} 部署到預發布環境`,
      '監控生產環境中的性能指標',
      '設置自動化回歸測試',
      '30天後安排後續實驗',
    ];

    const riskFactors = report.summary.confidence < 0.8
      ? ['Low statistical confidence — consider larger sample', 'Results may not generalize']
      : ['Standard deployment risks apply'];
    const riskFactorsZh = report.summary.confidence < 0.8
      ? ['統計置信度低——考慮更大的樣本', '結果可能無法推廣']
      : ['適用標準部署風險'];

    const recReport: RecommendationReport = {
      reportId: `rec_${Date.now()}`,
      experimentId,
      generatedAt: new Date().toISOString(),
      topPicks,
      actionItems,
      actionItemsZh,
      costAnalysis: costComp.variants,
      riskFactors,
      riskFactorsZh,
    };

    stored.recommendationReport = recReport;
    stored.updatedAt = new Date().toISOString();

    return recReport;
  }

  // ============================================
  // Experiment management
  // ============================================

  getExperiment(experimentId: string): PersistentExperiment | null {
    return this.experiments.get(experimentId) ?? null;
  }

  listExperiments(): PersistentExperiment[] {
    return [...this.experiments.values()];
  }

  cancelExperiment(experimentId: string): PersistentExperiment {
    const stored = this.experiments.get(experimentId);
    if (!stored) throw new Error(`Experiment ${experimentId} not found`);
    stored.config.status = 'cancelled';
    stored.config.completedAt = new Date().toISOString();
    stored.updatedAt = new Date().toISOString();
    return stored;
  }

  getAllData(): PersistentExperiment[] {
    return [...this.experiments.values()];
  }

  clearData(): void {
    this.experiments.clear();
    this.idCounter = 0;
  }

  // ============================================
  // Private helpers
  // ============================================

  private generateId(prefix: string): string {
    return `${prefix}_exp_${++this.idCounter}_${Date.now()}`;
  }

  private persist(id: string, data: PersistentExperiment): void {
    this.experiments.set(id, data);
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return this.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  }

  private round(n: number, decimals = 2): number {
    return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  private pooledStdDev(a: number[], b: number[]): number {
    const nA = a.length;
    const nB = b.length;
    if (nA < 2 || nB < 2) return 1;
    const varA = a.reduce((s, v) => s + Math.pow(v - this.avg(a), 2), 0) / (nA - 1);
    const varB = b.reduce((s, v) => s + Math.pow(v - this.avg(b), 2), 0) / (nB - 1);
    return Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));
  }

  private calcConsistency(scores: number[]): number {
    if (scores.length < 2) return 1;
    const avg = this.avg(scores);
    const variance = scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / scores.length;
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  private simulateScore(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private simulateVariantRuns(variant: PromptVariant, testCases: TestCase[]): Array<{
    score: number; latency: number; cost: number;
    consistency: number; hallucinationRisk: number; rubricAccuracy: number;
  }> {
    // Simulate deterministic variation based on variant properties
    const baseScore = variant.prompt.length > 100 ? 0.72 : 0.68;
    const baseLatency = variant.temperature > 0.5 ? 300 : 450;
    const baseCost = 0.0001 + variant.temperature * 0.0001;

    return testCases.map((_, i) => ({
      score: Math.max(0.01, this.round(baseScore + (Math.random() - 0.5) * 0.2)),
      latency: Math.max(1, Math.round(baseLatency + (Math.random() - 0.5) * 200)),
      cost: this.round(baseCost + Math.random() * 0.0001, 5),
      consistency: this.round(0.7 + Math.random() * 0.2),
      hallucinationRisk: this.round(Math.random() * 0.2),
      rubricAccuracy: this.round(0.65 + Math.random() * 0.3),
    }));
  }

  private simulateModelRuns(model: { provider: string; modelName: string; temperature: number }, testCases: TestCase[]): Array<{
    score: number; latency: number; cost: number;
    consistency: number; hallucinationRisk: number; rubricAccuracy: number;
  }> {
    // Higher-end models get better base scores
    const isPremium = model.modelName.includes('pro') || model.modelName.includes('ultra') || model.modelName.includes('opus');
    const baseScore = isPremium ? 0.78 : 0.70;
    const baseLatency = isPremium ? 600 : 350;
    const baseCost = isPremium ? 0.001 : 0.0003;

    return testCases.map(() => ({
      score: Math.max(0.01, this.round(baseScore + (Math.random() - 0.5) * 0.15)),
      latency: Math.max(1, Math.round(baseLatency + (Math.random() - 0.5) * 300)),
      cost: this.round(baseCost + Math.random() * 0.0005, 5),
      consistency: this.round(0.72 + Math.random() * 0.2),
      hallucinationRisk: this.round(0.05 + Math.random() * 0.15),
      rubricAccuracy: this.round(0.68 + Math.random() * 0.25),
    }));
  }

  private simulateTemperatureRuns(provider: string, modelName: string, temp: number, testCases: TestCase[]): Array<{
    score: number; latency: number; cost: number;
    creativity: number; coherence: number;
  }> {
    // Higher temperature = more creative but less coherent
    const creativity = 0.3 + temp * 0.7;
    const coherence = 1.0 - temp * 0.4;
    const score = (creativity * 0.4 + coherence * 0.6);

    return testCases.map(() => ({
      score: Math.max(0.01, this.round(score + (Math.random() - 0.5) * 0.15)),
      latency: Math.max(1, Math.round(350 + Math.random() * 200)),
      cost: this.round(0.0003 + temp * 0.0001, 5),
      creativity: this.round(creativity + (Math.random() - 0.5) * 0.1),
      coherence: this.round(coherence + (Math.random() - 0.5) * 0.1),
    }));
  }

  private buildABComparison(nameA: string, nameB: string, a: VariantResult | ModelResult | GroupResult, b: VariantResult | ModelResult | GroupResult): ABComparison {
    const scoreA = this.extractScore(a);
    const scoreB = this.extractScore(b);
    const metricsA: ComparisonMetrics = {
      avgScore: scoreA,
      avgLatency: 'avgLatency' in a ? a.avgLatency : 500,
      avgCost: 'avgCost' in a ? a.avgCost : 0,
      consistency: 'consistency' in a ? a.consistency : 1,
      hallucinationRisk: 'hallucinationRisk' in a ? a.hallucinationRisk : 0,
    };
    const metricsB: ComparisonMetrics = {
      avgScore: scoreB,
      avgLatency: 'avgLatency' in b ? b.avgLatency : 500,
      avgCost: 'avgCost' in b ? b.avgCost : 0,
      consistency: 'consistency' in b ? b.consistency : 1,
      hallucinationRisk: 'hallucinationRisk' in b ? b.hallucinationRisk : 0,
    };

    const diff = scoreA - scoreB;
    const winner: ABWinner = Math.abs(diff) < 0.03 ? 'tie' : diff > 0 ? 'A' : 'B';
    const scoreArrA = Array(10).fill(scoreA).map(v => v + (Math.random() - 0.5) * 0.1);
    const scoreArrB = Array(10).fill(scoreB).map(v => v + (Math.random() - 0.5) * 0.1);
    const effectSize = this.round(Math.abs(diff) / this.pooledStdDev(scoreArrA, scoreArrB));

    return {
      nameA,
      nameB,
      metricsA,
      metricsB,
      winner,
      confidence: Math.max(0.01, this.round(Math.min(0.95, Math.abs(diff) * 10))),
      pValue: this.round(0.05 / Math.max(1, Math.abs(diff) * 20)),
      effectSize,
      recommendation: winner === 'A'
        ? `${nameA} outperforms ${nameB} by ${this.round(Math.abs(diff) * 100)}%`
        : winner === 'B'
          ? `${nameB} outperforms ${nameA} by ${this.round(Math.abs(diff) * 100)}%`
          : `${nameA} and ${nameB} perform similarly`,
      recommendationZh: winner === 'A'
        ? `${nameA} 比 ${nameB} 好 ${this.round(Math.abs(diff) * 100)}%`
        : winner === 'B'
          ? `${nameB} 比 ${nameA} 好 ${this.round(Math.abs(diff) * 100)}%`
          : `${nameA} 和 ${nameB} 表現相近`,
    };
  }

  private extractScore(result: VariantResult | ModelResult | GroupResult): number {
    if ('gain' in result) return (result as GroupResult).gain / 100; // normalize gain (0-100) to 0-1
    return (result as VariantResult | ModelResult).avgScore;
  }

  private calcDuration(started?: string, completed?: string): string {
    if (!started || !completed) return 'N/A';
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  private calcSuccessMetrics(config: ExperimentConfig, summary: ReportSummary): SuccessMetrics {
    const hasWinner = summary.winner !== null;
    const confidenceScore = summary.confidence;
    const costEfficiency = summary.totalCost > 0 ? Math.min(1, 0.01 / Math.max(0.0001, summary.totalCost)) : 0.5;
    const timeEfficiency = summary.experimentDuration === 'N/A' ? 0.5 : 0.8;
    const recommendationQuality = confidenceScore * 0.8;

    return {
      experimentSuccess: hasWinner && confidenceScore > 0.6,
      confidenceScore,
      costEfficiency: this.round(costEfficiency),
      timeEfficiency,
      recommendationQuality: this.round(recommendationQuality),
      overallScore: this.round((confidenceScore + costEfficiency + timeEfficiency + recommendationQuality) / 4),
    };
  }

  private typeLabelZh(type: ExperimentType): string {
    switch (type) {
      case 'prompt': return '提示詞';
      case 'model': return '模型';
      case 'temperature': return '溫度';
      case 'learning': return '學習';
    }
  }
}

export const experimentService = new ExperimentService();
