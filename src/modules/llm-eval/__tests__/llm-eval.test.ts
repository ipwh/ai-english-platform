// Sprint 28: LLM Evaluation Platform — Unit Tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  runEval, runConsistencyEval, benchmarkPrompt, benchmarkModel, rankModels,
  comparePromptVersions, compareProviders, generateReport, getEvalHistory, clearEvalHistory,
  calcHallucinationRisk, calcConsistency, calcJsonValidity, calcRubricScore,
} from '../services/eval-engine';

beforeEach(() => { clearEvalHistory(); });

describe('MetricCalculators', () => {
  it('should detect hallucination patterns', () => {
    const low = calcHallucinationRisk('This is a simple answer.');
    const high = calcHallucinationRisk('According to a study by Harvard University conducted in 2023, it is certainly true that 78% of students prefer online learning. The research definitely proves this.');
    expect(high).toBeGreaterThan(low);
  });

  it('should score valid JSON as 1.0', () => {
    expect(calcJsonValidity('{"key": "value"}')).toBe(1);
    expect(calcJsonValidity('[1, 2, 3]')).toBe(1);
  });

  it('should detect JSON in markdown blocks', () => {
    expect(calcJsonValidity('```json\n{"a": 1}\n```')).toBe(0.9);
  });

  it('should score invalid text as 0', () => {
    expect(calcJsonValidity('just some text')).toBe(0);
  });

  it('should calculate consistency between outputs', () => {
    const similar = calcConsistency(['The cat sat on the mat', 'The cat sat on the mat']);
    expect(similar).toBeGreaterThan(0.5);

    const different = calcConsistency(['The cat sat on the mat', 'Quantum physics explains wormhole theory']);
    expect(different).toBeLessThan(similar);
  });

  it('should score rubric higher for better output', () => {
    const low = calcRubricScore('ok');
    const high = calcRubricScore('This is a well-structured response with multiple paragraphs. Furthermore, it demonstrates strong vocabulary and complex sentence structures. Therefore, the overall quality is significantly better.');
    expect(high).toBeGreaterThan(low);
  });
});

describe('EvaluationEngine', () => {
  it('should run a single evaluation', () => {
    const result = runEval('Test input', 'Test output', 'Expected output', 100, 0.001);
    expect(result.runId).toBeTruthy();
    expect(result.metrics.latencyMs).toBe(100);
    expect(result.metrics.costUsd).toBe(0.001);
  });

  it('should calculate all metrics', () => {
    const result = runEval('What is AI?', 'Artificial Intelligence is a field of computer science.', 'AI is computer science.', 50, 0.0005);
    expect(result.metrics.latencyMs).toBe(50);
    expect(result.metrics.hallucinationRisk).toBeGreaterThanOrEqual(0);
    expect(result.metrics.hallucinationRisk).toBeLessThanOrEqual(1);
    expect(result.metrics.rubricScore).toBeGreaterThanOrEqual(0);
    expect(result.metrics.rubricScore).toBeLessThanOrEqual(100);
    expect(result.metrics.jsonValidity).toBeGreaterThanOrEqual(0);
    expect(result.metrics.jsonValidity).toBeLessThanOrEqual(1);
  });

  it('should run consistency evaluation', () => {
    const outputs = ['Answer A: The sky is blue', 'Answer B: The sky is blue', 'Answer C: The sky appears blue'];
    const metrics = runConsistencyEval('What color is the sky?', outputs);
    expect(metrics.consistency).toBeGreaterThan(0);
  });

  it('should track evaluation history', () => {
    runEval('in1', 'out1');
    runEval('in2', 'out2');
    const history = getEvalHistory();
    expect(history.totalRuns).toBe(2);
    expect(history.runs.length).toBe(2);
  });

  it('should clear history', () => {
    runEval('in', 'out');
    clearEvalHistory();
    expect(getEvalHistory().totalRuns).toBe(0);
  });
});

describe('Benchmarking', () => {
  it('should benchmark a prompt', () => {
    const metrics = { latencyMs: 200, costUsd: 0.002, hallucinationRisk: 0.1, consistency: 0.8, jsonValidity: 0.9, rubricScore: 75 };
    const result = benchmarkPrompt('p1', 'Test Prompt', 'v1', 'deepseek', 'deepseek-v4-flash', metrics, []);
    expect(result.passed).toBe(true);
    expect(result.promptId).toBe('p1');
  });

  it('should fail benchmark with issues', () => {
    const metrics = { latencyMs: 200, costUsd: 0.002, hallucinationRisk: 0.1, consistency: 0.8, jsonValidity: 0.5, rubricScore: 40 };
    const result = benchmarkPrompt('p1', 'Bad Prompt', 'v1', 'deepseek', 'deepseek-v4-flash', metrics, ['Low rubric score']);
    expect(result.passed).toBe(false);
  });

  it('should rank models', () => {
    const models = [
      benchmarkModel('m1', 'Model A', 'deepseek', { latencyMs: 100, costUsd: 0.001, hallucinationRisk: 0.1, consistency: 0.9, jsonValidity: 0.95, rubricScore: 85 }, ['Fast'], []),
      benchmarkModel('m2', 'Model B', 'gemini', { latencyMs: 300, costUsd: 0.002, hallucinationRisk: 0.2, consistency: 0.8, jsonValidity: 0.8, rubricScore: 70 }, [], ['Slow']),
    ];
    const ranked = rankModels(models);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });
});

describe('Comparisons', () => {
  it('should compare prompt versions', () => {
    const baseline = { latencyMs: 300, costUsd: 0.003, hallucinationRisk: 0.2, consistency: 0.7, jsonValidity: 0.8, rubricScore: 65 };
    const candidate = { latencyMs: 200, costUsd: 0.002, hallucinationRisk: 0.1, consistency: 0.85, jsonValidity: 0.9, rubricScore: 75 };
    const result = comparePromptVersions(baseline, candidate, 'v1', 'v2', '1.0', '1.1');
    expect(result.winner).toBe('v2');
    expect(result.metricsDiff.latency.improved).toBe(true);
    expect(result.metricsDiff.rubric_score.improved).toBe(true);
  });

  it('should compare providers', () => {
    const result = compareProviders({
      deepseek: { latencyMs: 200, costUsd: 0.001, hallucinationRisk: 0.1, consistency: 0.9, jsonValidity: 0.95, rubricScore: 80 },
      gemini: { latencyMs: 400, costUsd: 0.002, hallucinationRisk: 0.15, consistency: 0.85, jsonValidity: 0.9, rubricScore: 75 },
    });
    expect(result.rankings.length).toBe(2);
    expect(result.rankings[0].rank).toBe(1);
    expect(result.bestFor).toBeDefined();
  });
});

describe('Reports', () => {
  it('should generate report with recommendations', () => {
    const results = [
      runEval('q1', 'short'),
      runEval('q2', 'short too'),
    ];
    const report = generateReport('prompt-benchmark', results, 'Test Report');
    expect(report.title).toBe('Test Report');
    expect(report.summary.length).toBeGreaterThan(10);
    expect(report.summaryZh.length).toBeGreaterThan(10);
    expect(report.results.length).toBe(2);
  });

  it('should include recommendations for poor quality', () => {
    const results = [runEval('q', 'bad')]; // Very short = low rubric score
    const report = generateReport('prompt-benchmark', results, 'Quality Report');
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should track reports in history', () => {
    generateReport('prompt-benchmark', [runEval('q', 'a')], 'R1');
    const history = getEvalHistory();
    expect(history.reports.length).toBe(1);
  });
});

describe('EdgeCases', () => {
  it('should handle empty output', () => {
    const result = runEval('input', '');
    expect(result.metrics.hallucinationRisk).toBeGreaterThanOrEqual(0);
    expect(result.metrics.rubricScore).toBeGreaterThanOrEqual(0);
  });

  it('should handle single output for consistency', () => {
    const metrics = runConsistencyEval('q', ['only one']);
    expect(metrics.consistency).toBe(0.5);
  });

  it('should handle empty eval history', () => {
    const history = getEvalHistory();
    expect(history.totalRuns).toBe(0);
    expect(history.averageMetrics.rubricScore).toBe(0);
  });

  it('calcJsonValidity should handle empty string', () => {
    expect(calcJsonValidity('')).toBe(0);
  });
});
