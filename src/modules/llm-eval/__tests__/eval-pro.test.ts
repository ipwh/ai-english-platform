// Sprint 41: AI Evaluation Platform Pro — Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { AIEvaluationPro } from '../services/eval-pro';

const evalPro = new AIEvaluationPro();

beforeEach(() => {
  evalPro.clearHistory();
});

const sampleRun = {
  runId: 'r1', promptVersion: 'v1.0', modelProvider: 'deepseek', modelName: 'deepseek-chat',
  input: 'What is the past tense of go?',
  output: 'The past tense of "go" is "went".',
  expectedOutput: 'The past tense of go is went.',
  latencyMs: 450, costUsd: 0.0005,
};

describe('AIEvaluationPro — Core Metrics', () => {
  it('should evaluate a run with all metrics', () => {
    const metrics = evalPro.evaluate(sampleRun);
    expect(metrics.runId).toBe('r1');
    expect(metrics.latencyMs).toBe(450);
    expect(metrics.consistency).toBeGreaterThan(0);
    expect(metrics.jsonValidity).toBeGreaterThanOrEqual(0);
    expect(metrics.hallucinationRisk).toBeGreaterThanOrEqual(0);
    expect(metrics.rubricAccuracy).toBeGreaterThan(0);
    expect(metrics.overallScore).toBeGreaterThan(0);
    expect(metrics.overallScore).toBeLessThanOrEqual(1);
  });

  it('should detect valid JSON', () => {
    const metrics = evalPro.evaluate({
      ...sampleRun, output: '{"answer": "went"}',
    });
    expect(metrics.jsonValidity).toBe(1.0);
  });

  it('should detect invalid JSON', () => {
    const metrics = evalPro.evaluate({
      ...sampleRun, output: 'The answer is went',
    });
    expect(metrics.jsonValidity).toBeLessThan(1.0);
  });

  it('should track hallucination risk', () => {
    const metrics = evalPro.evaluate({
      ...sampleRun,
      output: 'According to the 2025 study by Harvard University, the answer is always "went" for everyone.',
    });
    expect(metrics.hallucinationRisk).toBeGreaterThan(0.1);
  });
});

describe('AIEvaluationPro — Provider Metrics', () => {
  it('should aggregate provider metrics', () => {
    evalPro.evaluate(sampleRun);
    evalPro.evaluate({ ...sampleRun, runId: 'r2', latencyMs: 550, costUsd: 0.0006 });

    const metrics = evalPro.getProviderMetrics('deepseek');
    expect(metrics).toBeDefined();
    expect(metrics!.totalRuns).toBe(2);
    expect(metrics!.avgLatency).toBeGreaterThan(0);
    expect(metrics!.overallScore).toBeGreaterThan(0);
  });

  it('should rank providers', () => {
    evalPro.evaluate({ ...sampleRun, modelProvider: 'deepseek', runId: 'r_deep' });
    evalPro.evaluate({ ...sampleRun, modelProvider: 'gemini', runId: 'r_gemini', output: 'went', expectedOutput: 'went' });

    const rankings = evalPro.getProviderRankings();
    expect(rankings.length).toBe(2);
    expect(rankings[0].provider).toBeDefined();
    expect(rankings[0].overallScore).toBeGreaterThanOrEqual(rankings[1].overallScore || 0);
  });
});

describe('AIEvaluationPro — A/B Testing', () => {
  it('should run A/B test between prompt versions', () => {
    const runsA = Array(5).fill(null).map((_, i) => ({
      ...sampleRun, runId: `a${i}`, promptVersion: 'v1.0', output: 'The past tense of "go" is "went".',
    }));
    const runsB = Array(5).fill(null).map((_, i) => ({
      ...sampleRun, runId: `b${i}`, promptVersion: 'v2.0', output: 'The past tense of go is went.',
    }));

    const result = evalPro.runABTest({
      testId: 'ab-test-1', promptVersionA: 'v1.0', promptVersionB: 'v2.0',
      modelProvider: 'deepseek', runsA, runsB,
    });

    expect(result.testId).toBe('ab-test-1');
    expect(result.sampleSize).toBe(5);
    expect(result.metrics.versionA).toBeDefined();
    expect(result.metrics.versionB).toBeDefined();
    expect(['A', 'B', 'tie']).toContain(result.winner);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
    expect(result.recommendationZh).toBeTruthy();
    expect(result.detailedComparison.length).toBe(6);
  });
});

describe('AIEvaluationPro — Quality Metrics', () => {
  it('should evaluate feedback quality', () => {
    const quality = evalPro.evaluateFeedback({
      relevance: 0.8, accuracy: 0.9, helpfulness: 0.7, specificity: 0.8, actionability: 0.7,
    });
    expect(quality.overall).toBeGreaterThan(0.7);
  });

  it('should evaluate recommendation quality', () => {
    const quality = evalPro.evaluateRecommendations({
      appropriateness: 0.9, diversity: 0.7, personalization: 0.8, feasibility: 0.8,
    });
    expect(quality.overall).toBeGreaterThan(0.7);
  });

  it('should calculate learning gain', () => {
    const gain = evalPro.calculateLearningGain(60, 78);
    expect(gain.gain).toBe(18);
    expect(gain.normalizedGain).toBeGreaterThan(0);
    expect(gain.normalizedGain).toBeLessThanOrEqual(1);
    expect(gain.effectSize).toBeGreaterThan(0);
  });
});

describe('AIEvaluationPro — Report & History', () => {
  it('should generate evaluation report', () => {
    evalPro.evaluate(sampleRun);
    const report = evalPro.generateReport('2026-07-01', '2026-07-19');
    expect(report.overview.totalRuns).toBeGreaterThan(0);
    expect(report.providerRankings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendationsZh.length).toBe(report.recommendations.length);
  });

  it('should track evaluation history', () => {
    evalPro.evaluate(sampleRun);
    const history = evalPro.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].runId).toBe('r1');
    expect(history[0].promptVersion).toBe('v1.0');
  });
});