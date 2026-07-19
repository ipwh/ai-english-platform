// Sprint 41: AIEvaluationPro — full evaluation engine
import type {
  EvalRunInput, EvalMetrics, ProviderMetrics, ABTestResult, ABTestMetrics,
  EvalReport, EvalHistoryEntry, FeedbackQualityMetrics,
  RecommendationQualityMetrics, LearningGainMetrics,
} from '../types-pro';

// ============================================
// AIEvaluationPro
// ============================================

export class AIEvaluationPro {
  private history: EvalHistoryEntry[] = [];
  private runs: Map<string, EvalMetrics[]> = new Map();

  /** Evaluate a single run with full metrics */
  evaluate(input: EvalRunInput): EvalMetrics {
    const consistency = this.calcConsistency(input);
    const jsonValidity = this.calcJsonValidity(input.output);
    const hallucinationRisk = this.calcHallucinationRisk(input);
    const rubricAccuracy = this.calcRubricAccuracy(input);

    const overallScore = Math.round(
      (consistency * 0.25 + jsonValidity * 0.20 + (1 - hallucinationRisk) * 0.30 + rubricAccuracy * 0.25) * 100,
    ) / 100;

    const metrics: EvalMetrics = {
      runId: input.runId,
      timestamp: new Date().toISOString(),
      latencyMs: input.latencyMs,
      costUsd: input.costUsd,
      consistency,
      jsonValidity,
      hallucinationRisk,
      rubricAccuracy,
      overallScore,
    };

    // Store in history
    const providerRuns = this.runs.get(input.modelProvider) || [];
    providerRuns.push(metrics);
    this.runs.set(input.modelProvider, providerRuns);

    this.history.push({
      id: `eval_${Date.now()}`,
      runId: input.runId,
      promptVersion: input.promptVersion,
      modelProvider: input.modelProvider,
      metrics,
      createdAt: new Date().toISOString(),
    });

    return metrics;
  }

  /** Get provider performance metrics */
  getProviderMetrics(provider: string): ProviderMetrics | null {
    const runs = this.runs.get(provider);
    if (!runs || runs.length === 0) return null;

    const n = runs.length;
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / n;

    return {
      provider,
      model: 'default',
      totalRuns: n,
      avgLatency: Math.round(avg(runs.map(r => r.latencyMs))),
      avgCost: Math.round(avg(runs.map(r => r.costUsd)) * 10000) / 10000,
      avgConsistency: Math.round(avg(runs.map(r => r.consistency)) * 100) / 100,
      avgJsonValidity: Math.round(avg(runs.map(r => r.jsonValidity)) * 100) / 100,
      avgHallucinationRisk: Math.round(avg(runs.map(r => r.hallucinationRisk)) * 100) / 100,
      avgRubricAccuracy: Math.round(avg(runs.map(r => r.rubricAccuracy)) * 100) / 100,
      overallScore: Math.round(avg(runs.map(r => r.overallScore)) * 100) / 100,
      reliability: 1.0,
    };
  }

  /** Get all provider rankings */
  getProviderRankings(): ProviderMetrics[] {
    const providers = [...this.runs.keys()];
    return providers
      .map(p => this.getProviderMetrics(p)!)
      .filter(Boolean)
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  /** Run A/B test between two prompt versions */
  runABTest(opts: {
    testId: string;
    promptVersionA: string;
    promptVersionB: string;
    modelProvider: string;
    runsA: EvalRunInput[];
    runsB: EvalRunInput[];
  }): ABTestResult {
    const metricsA = this.computeABMetrics(opts.runsA);
    const metricsB = this.computeABMetrics(opts.runsB);

    const detailedComparison = [
      { metric: 'Overall Score', a: metricsA.avgScore, b: metricsB.avgScore, difference: Math.round((metricsB.avgScore - metricsA.avgScore) * 100) / 100, significant: Math.abs(metricsB.avgScore - metricsA.avgScore) > 0.05 },
      { metric: 'Consistency', a: metricsA.consistency, b: metricsB.consistency, difference: Math.round((metricsB.consistency - metricsA.consistency) * 100) / 100, significant: Math.abs(metricsB.consistency - metricsA.consistency) > 0.1 },
      { metric: 'JSON Validity', a: metricsA.jsonValidity, b: metricsB.jsonValidity, difference: Math.round((metricsB.jsonValidity - metricsA.jsonValidity) * 100) / 100, significant: Math.abs(metricsB.jsonValidity - metricsA.jsonValidity) > 0.1 },
      { metric: 'Hallucination Risk', a: metricsA.hallucinationRisk, b: metricsB.hallucinationRisk, difference: Math.round((metricsA.hallucinationRisk - metricsB.hallucinationRisk) * 100) / 100, significant: Math.abs(metricsB.hallucinationRisk - metricsA.hallucinationRisk) > 0.1 },
      { metric: 'Rubric Accuracy', a: metricsA.rubricAccuracy, b: metricsB.rubricAccuracy, difference: Math.round((metricsB.rubricAccuracy - metricsA.rubricAccuracy) * 100) / 100, significant: Math.abs(metricsB.rubricAccuracy - metricsA.rubricAccuracy) > 0.05 },
      { metric: 'Latency', a: metricsA.avgLatency, b: metricsB.avgLatency, difference: Math.round(metricsB.avgLatency - metricsA.avgLatency), significant: Math.abs(metricsB.avgLatency - metricsA.avgLatency) > 500 },
    ];

    const scoreDiff = metricsB.avgScore - metricsA.avgScore;
    const winner: ABTestResult['winner'] = Math.abs(scoreDiff) < 0.03 ? 'tie' : scoreDiff > 0 ? 'B' : 'A';
    const confidence = Math.min(0.95, opts.runsA.length / 20);

    return {
      testId: opts.testId,
      promptVersionA: opts.promptVersionA,
      promptVersionB: opts.promptVersionB,
      modelProvider: opts.modelProvider,
      sampleSize: opts.runsA.length,
      metrics: { versionA: metricsA, versionB: metricsB },
      winner,
      confidence: Math.round(confidence * 100) / 100,
      recommendation: winner === 'B'
        ? `Version B (${opts.promptVersionB}) outperforms A by ${Math.round(Math.abs(scoreDiff) * 100)}%`
        : winner === 'A'
          ? `Version A (${opts.promptVersionA}) outperforms B by ${Math.round(Math.abs(scoreDiff) * 100)}%`
          : 'Both versions perform similarly — consider other factors like cost or latency',
      recommendationZh: winner === 'B'
        ? `版本 B（${opts.promptVersionB}）比 A 好 ${Math.round(Math.abs(scoreDiff) * 100)}%`
        : winner === 'A'
          ? `版本 A（${opts.promptVersionA}）比 B 好 ${Math.round(Math.abs(scoreDiff) * 100)}%`
          : '兩個版本表現相近——考慮成本或延遲等其他因素',
      detailedComparison,
    };
  }

  /** Evaluate feedback quality */
  evaluateFeedback(feedback: {
    relevance: number; accuracy: number; helpfulness: number;
    specificity: number; actionability: number;
  }): FeedbackQualityMetrics {
    const overall = (feedback.relevance + feedback.accuracy + feedback.helpfulness + feedback.specificity + feedback.actionability) / 5;
    return { ...feedback, overall: Math.round(overall * 100) / 100 };
  }

  /** Evaluate recommendation quality */
  evaluateRecommendations(recs: {
    appropriateness: number; diversity: number;
    personalization: number; feasibility: number;
  }): RecommendationQualityMetrics {
    const overall = (recs.appropriateness + recs.diversity + recs.personalization + recs.feasibility) / 4;
    return { ...recs, overall: Math.round(overall * 100) / 100 };
  }

  /** Calculate learning gain (pre/post test) */
  calculateLearningGain(preScore: number, postScore: number, maxScore = 100): LearningGainMetrics {
    const gain = postScore - preScore;
    const normalizedGain = gain / Math.max(1, maxScore - preScore);
    const effectSize = gain / 15; // Cohen's d approximation

    return {
      preScore, postScore, gain,
      normalizedGain: Math.round(normalizedGain * 100) / 100,
      effectSize: Math.round(effectSize * 100) / 100,
    };
  }

  /** Generate comprehensive evaluation report */
  generateReport(periodStart: string, periodEnd: string): EvalReport {
    const rankings = this.getProviderRankings();
    const totalRuns = this.history.length;
    const totalCost = this.history.reduce((s, h) => s + h.metrics.costUsd, 0);
    const avgScore = totalRuns > 0 ? this.history.reduce((s, h) => s + h.metrics.overallScore, 0) / totalRuns : 0;

    return {
      reportId: `report_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      period: { start: periodStart, end: periodEnd },
      overview: {
        totalRuns,
        activeProviders: this.runs.size,
        activeModels: rankings.length,
        averageOverallScore: Math.round(avgScore * 100) / 100,
        totalCost: Math.round(totalCost * 10000) / 10000,
      },
      providerRankings: rankings,
      trendAnalysis: {
        scoreTrend: avgScore > 0.7 ? 'improving' : 'stable',
        latencyTrend: 'stable',
        costTrend: 'stable',
      },
      abTests: [],
      recommendations: rankings.length > 1
        ? [`Top provider: ${rankings[0].provider} (score: ${rankings[0].overallScore})`]
        : ['Run more evaluations to generate meaningful insights'],
      recommendationsZh: rankings.length > 1
        ? [`最佳供應商：${rankings[0].provider}（分數：${rankings[0].overallScore}）`]
        : ['進行更多評估以生成有意義的見解'],
    };
  }

  /** Get evaluation history */
  getHistory(limit = 50): EvalHistoryEntry[] {
    return this.history.slice(-limit);
  }

  /** Clear evaluation history */
  clearHistory(): void {
    this.history = [];
    this.runs.clear();
  }

  // ============================================
  // Private metric calculators
  // ============================================

  private calcConsistency(input: EvalRunInput): number {
    if (!input.expectedOutput) return 0.8;
    const output = input.output.toLowerCase();
    const expected = input.expectedOutput.toLowerCase();
    const overlap = expected.split(/\s+/).filter(w => output.includes(w)).length;
    const total = expected.split(/\s+/).length || 1;
    return Math.round(Math.min(1, overlap / total) * 100) / 100;
  }

  private calcJsonValidity(output: string): number {
    try {
      JSON.parse(output);
      return 1.0;
    } catch {
      // Check if it has JSON-like structure
      const hasBraces = output.includes('{') && output.includes('}');
      const hasBrackets = output.includes('[') && output.includes(']');
      return hasBraces || hasBrackets ? 0.5 : 0.1;
    }
  }

  private calcHallucinationRisk(input: EvalRunInput): number {
    let risk = 0;
    const output = input.output.toLowerCase();

    // Check for common hallucination patterns
    if (/\b(\d{4})\b/.test(output) && !/\b(\d{4})\b/.test(input.input)) risk += 0.2; // Made-up years
    if (output.includes('according to') && !input.input.includes('according to')) risk += 0.15; // Fabricated citations
    if (output.length > input.input.length * 3) risk += 0.1; // Unusually long output
    if (/\b(always|never|everyone|no one|all|none)\b/.test(output)) risk += 0.1; // Absolute claims

    return Math.round(Math.min(1, risk) * 100) / 100;
  }

  private calcRubricAccuracy(input: EvalRunInput): number {
    if (!input.expectedOutput) return 0.7;
    const outputWords = new Set(input.output.toLowerCase().split(/\s+/));
    const expectedWords = input.expectedOutput.toLowerCase().split(/\s+/);
    const matched = expectedWords.filter(w => outputWords.has(w)).length;
    return Math.round(Math.min(1, matched / Math.max(1, expectedWords.length)) * 100) / 100;
  }

  private computeABMetrics(runs: EvalRunInput[]): ABTestMetrics {
    if (runs.length === 0) return { avgScore: 0, consistency: 0, jsonValidity: 0, hallucinationRisk: 0, rubricAccuracy: 0, avgLatency: 0, avgCost: 0 };

    const metrics = runs.map(r => this.evaluate(r));
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / runs.length;

    return {
      avgScore: Math.round(avg(metrics.map(m => m.overallScore)) * 100) / 100,
      consistency: Math.round(avg(metrics.map(m => m.consistency)) * 100) / 100,
      jsonValidity: Math.round(avg(metrics.map(m => m.jsonValidity)) * 100) / 100,
      hallucinationRisk: Math.round(avg(metrics.map(m => m.hallucinationRisk)) * 100) / 100,
      rubricAccuracy: Math.round(avg(metrics.map(m => m.rubricAccuracy)) * 100) / 100,
      avgLatency: Math.round(avg(metrics.map(m => m.latencyMs))),
      avgCost: Math.round(avg(metrics.map(m => m.costUsd)) * 10000) / 10000,
    };
  }
}

export const aiEvalPro = new AIEvaluationPro();
