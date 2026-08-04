// Sprint 42: AI Experiment Platform — Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { ExperimentService } from '../services/experiment-engine';

const service = new ExperimentService();

beforeEach(() => {
  service.clearData();
});

// ============================================
// Sample data
// ============================================

const sampleTestCases = [
  { id: 'tc1', input: 'Explain the past tense in English', expectedOutput: 'The past tense describes actions that happened in the past.' },
  { id: 'tc2', input: 'What is a metaphor?', expectedOutput: 'A metaphor is a figure of speech that compares two unlike things.' },
  { id: 'tc3', input: 'Define irony', expectedOutput: 'Irony is when the opposite of what is expected occurs.' },
];

const samplePromptVariants = [
  { name: 'Baseline', version: 'v1.0', prompt: 'You are an English teacher. Explain: {{input}}', modelProvider: 'deepseek', modelName: 'deepseek-chat', temperature: 0.3 },
  { name: 'Detailed', version: 'v2.0', prompt: 'You are an expert English teacher with 20 years of experience. Provide a detailed, student-friendly explanation with examples for: {{input}}', modelProvider: 'deepseek', modelName: 'deepseek-chat', temperature: 0.5 },
  { name: 'Concise', version: 'v3.0', prompt: 'Be brief and clear. Explain in 2-3 sentences: {{input}}', modelProvider: 'deepseek', modelName: 'deepseek-chat', temperature: 0.3 },
];

const sampleModels = [
  { provider: 'deepseek', modelName: 'deepseek-chat', temperature: 0.3 },
  { provider: 'gemini', modelName: 'gemini-pro', temperature: 0.3 },
  { provider: 'openai', modelName: 'gpt-4o', temperature: 0.3 },
];

const sampleTemperatures = [0.1, 0.3, 0.5, 0.7, 0.9];

const sampleGroups = [
  { name: 'Control', condition: 'Traditional instruction', studentIds: ['s1', 's2', 's3'], intervention: 'Standard textbook exercises' },
  { name: 'AI-Assisted', condition: 'AI-powered learning', studentIds: ['s4', 's5', 's6'], intervention: 'AI tutor with adaptive feedback' },
  { name: 'Blended', condition: 'Mixed approach', studentIds: ['s7', 's8', 's9'], intervention: 'AI tutor + teacher review' },
];

// ============================================
// Prompt Experiment Tests
// ============================================

describe('ExperimentService — Prompt Experiment', () => {
  it('should create a prompt experiment', () => {
    const exp = service.createPromptExperiment({
      name: 'Prompt Version Test',
      description: 'Compare baseline vs detailed prompts',
      variants: samplePromptVariants,
      testCases: sampleTestCases,
    });

    expect(exp.id).toContain('prompt_exp');
    expect(exp.type).toBe('prompt');
    expect(exp.status).toBe('draft');
    expect(exp.variants).toHaveLength(3);
    expect(exp.testCases).toHaveLength(3);
    expect(exp.featureFlag).toBe('experiment');
  });

  it('should run a prompt experiment and determine winner', () => {
    const exp = service.createPromptExperiment({
      name: 'Prompt Version Test',
      description: 'Compare baseline vs detailed',
      variants: samplePromptVariants,
      testCases: sampleTestCases,
    });

    const result = service.runPromptExperiment(exp.id);

    expect(result.experimentId).toBe(exp.id);
    expect(result.variantResults).toHaveLength(3);
    expect(result.winner).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.completedAt).toBeTruthy();

    // Each variant should have metrics
    result.variantResults.forEach(v => {
      expect(v.variantName).toBeTruthy();
      expect(v.avgScore).toBeGreaterThan(0);
      expect(v.avgScore).toBeLessThanOrEqual(1);
      expect(v.avgLatency).toBeGreaterThan(0);
      expect(v.avgCost).toBeGreaterThanOrEqual(0);
      expect(v.sampleSize).toBeGreaterThan(0);
      expect(v.consistency).toBeGreaterThanOrEqual(0);
      expect(v.hallucinationRisk).toBeGreaterThanOrEqual(0);
    });

    // AB comparison should exist with >= 2 variants
    expect(result.abComparison).toBeTruthy();
    expect(result.abComparison!.winner).toMatch(/^(A|B|tie)$/);
    expect(result.abComparison!.confidence).toBeGreaterThan(0);
  });

  it('should throw for non-existent experiment', () => {
    expect(() => service.runPromptExperiment('nonexistent'))
      .toThrow('Experiment nonexistent not found');
  });

  it('should throw for wrong experiment type', () => {
    const exp = service.createModelExperiment({
      name: 'Model Test',
      description: 'Testing',
      models: sampleModels,
      testCases: sampleTestCases,
    });
    expect(() => service.runPromptExperiment(exp.id))
      .toThrow('is not a prompt experiment');
  });

  it('should have AB comparison with bilingual recommendations', () => {
    const exp = service.createPromptExperiment({
      name: 'Prompt AB Test',
      description: 'Testing',
      variants: [samplePromptVariants[0], samplePromptVariants[1]],
      testCases: sampleTestCases,
    });

    const result = service.runPromptExperiment(exp.id);
    expect(result.abComparison!.recommendation.length).toBeGreaterThan(0);
    expect(result.abComparison!.recommendationZh.length).toBeGreaterThan(0);
  });
});

// ============================================
// Model Experiment Tests
// ============================================

describe('ExperimentService — Model Experiment', () => {
  it('should create a model experiment', () => {
    const exp = service.createModelExperiment({
      name: 'Model Comparison Test',
      description: 'Compare AI model providers',
      models: sampleModels,
      testCases: sampleTestCases,
    });

    expect(exp.type).toBe('model');
    expect(exp.models).toHaveLength(3);
    expect(exp.status).toBe('draft');
  });

  it('should run a model experiment with rankings', () => {
    const exp = service.createModelExperiment({
      name: 'Model Comparison',
      description: 'Compare models',
      models: sampleModels,
      testCases: sampleTestCases,
    });

    const result = service.runModelExperiment(exp.id);

    expect(result.modelResults).toHaveLength(3);
    expect(result.winner).toBeTruthy();
    expect(result.rankings).toHaveLength(3);
    expect(result.rankings[0].rank).toBe(1);
    expect(result.rankings[2].rank).toBe(3);

    // Rankings should be sorted by overallScore
    for (let i = 1; i < result.rankings.length; i++) {
      expect(result.rankings[i - 1].overallScore).toBeGreaterThanOrEqual(result.rankings[i].overallScore);
    }
  });

  it('should distinguish premium vs standard models', () => {
    const exp = service.createModelExperiment({
      name: 'Premium Test',
      description: 'Testing',
      models: [
        { provider: 'openai', modelName: 'gpt-4-ultra', temperature: 0.3 },
        { provider: 'gemini', modelName: 'gemini-flash', temperature: 0.3 },
      ],
      testCases: sampleTestCases,
    });

    const result = service.runModelExperiment(exp.id);
    // Premium models should score higher on average
    const premium = result.modelResults.find(m => m.modelName.includes('ultra'));
    const standard = result.modelResults.find(m => m.modelName.includes('flash'));
    expect(premium).toBeTruthy();
    expect(standard).toBeTruthy();
  });
});

// ============================================
// Temperature Experiment Tests
// ============================================

describe('ExperimentService — Temperature Experiment', () => {
  it('should create a temperature experiment', () => {
    const exp = service.createTemperatureExperiment({
      name: 'Temperature Sweep',
      description: 'Find optimal temperature',
      modelProvider: 'deepseek',
      modelName: 'deepseek-chat',
      temperatures: sampleTemperatures,
      testCases: sampleTestCases,
    });

    expect(exp.type).toBe('temperature');
    expect(exp.temperatures).toHaveLength(5);
    expect(exp.modelProvider).toBe('deepseek');
  });

  it('should run a temperature experiment with optimal temp', () => {
    const exp = service.createTemperatureExperiment({
      name: 'Temperature Sweep',
      description: 'Find optimal',
      modelProvider: 'deepseek',
      modelName: 'deepseek-chat',
      temperatures: sampleTemperatures,
      testCases: sampleTestCases,
    });

    const result = service.runTemperatureExperiment(exp.id);

    expect(result.tempResults).toHaveLength(5);
    expect(result.optimalTemperature).toBeGreaterThanOrEqual(0.1);
    expect(result.optimalTemperature).toBeLessThanOrEqual(0.9);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendationsZh.length).toBeGreaterThan(0);

    // Higher temps should have higher creativity
    const low = result.tempResults.find(t => t.temperature === 0.1);
    const high = result.tempResults.find(t => t.temperature === 0.9);
    expect(low!.avgCreativity).toBeLessThan(high!.avgCreativity);
  });

  it('should balance creativity and coherence', () => {
    const exp = service.createTemperatureExperiment({
      name: 'Balance Test',
      description: 'Testing',
      modelProvider: 'deepseek',
      modelName: 'deepseek-chat',
      temperatures: [0.1, 0.5, 0.9],
      testCases: sampleTestCases,
    });

    const result = service.runTemperatureExperiment(exp.id);

    result.tempResults.forEach(t => {
      expect(t.avgCreativity).toBeGreaterThanOrEqual(0);
      expect(t.avgCreativity).toBeLessThanOrEqual(1);
      expect(t.avgCoherence).toBeGreaterThanOrEqual(0);
      expect(t.avgCoherence).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================
// Learning Experiment Tests
// ============================================

describe('ExperimentService — Learning Experiment', () => {
  it('should create a learning experiment', () => {
    const exp = service.createLearningExperiment({
      name: 'Learning Method Study',
      description: 'Compare teaching methods',
      groups: sampleGroups,
      preTestId: 'pre_001',
      postTestId: 'post_001',
      duration: '4 weeks',
    });

    expect(exp.type).toBe('learning');
    expect(exp.groups).toHaveLength(3);
    expect(exp.preTestId).toBe('pre_001');
    expect(exp.postTestId).toBe('post_001');
    expect(exp.duration).toBe('4 weeks');
  });

  it('should run a learning experiment with learning gain', () => {
    const exp = service.createLearningExperiment({
      name: 'Learning Study',
      description: 'Compare methods',
      groups: sampleGroups,
      preTestId: 'pre_001',
      postTestId: 'post_001',
      duration: '4 weeks',
    });

    const result = service.runLearningExperiment(exp.id);

    expect(result.groupResults).toHaveLength(3);
    expect(result.winner).toBeTruthy();
    expect(result.learningGain.bestGroup).toBe(result.winner);
    expect(result.learningGain.comparisonTable).toHaveLength(3);

    // Each group should have pre/post scores
    result.groupResults.forEach(g => {
      expect(g.preAvg).toBeGreaterThan(0);
      expect(g.postAvg).toBeGreaterThan(g.preAvg);
      expect(g.gain).toBeGreaterThan(0);
      expect(g.normalizedGain).toBeGreaterThan(0);
      expect(g.effectSize).toBeGreaterThan(0);
      expect(g.masteryImprovement).toBeGreaterThan(0);
    });

    // Learning gain comparison table
    result.learningGain.comparisonTable.forEach(c => {
      expect(c.avgGain).toBeGreaterThan(0);
      expect(c.normalizedGain).toBeGreaterThan(0);
      expect(c.effectSize).toBeGreaterThan(0);
      expect(typeof c.significant).toBe('boolean');
    });

    // Mastery improvement
    expect(result.masteryImprovement.bestGroup).toBeTruthy();
    result.masteryImprovement.comparisonTable.forEach(c => {
      expect(c.masteryPre).toBeGreaterThan(0);
      expect(c.masteryPost).toBeGreaterThan(c.masteryPre);
      expect(c.improvement).toBeGreaterThan(0);
    });
  });

  it('should produce bilingual recommendations', () => {
    const exp = service.createLearningExperiment({
      name: 'Bilingual Test',
      description: 'Testing',
      groups: [sampleGroups[0], sampleGroups[1]],
      preTestId: 'pre_002',
      postTestId: 'post_002',
      duration: '2 weeks',
    });

    const result = service.runLearningExperiment(exp.id);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendationsZh.length).toBeGreaterThan(0);
  });
});

// ============================================
// A/B Testing Tests
// ============================================

describe('ExperimentService — A/B Testing', () => {
  it('should run A/B test with statistical comparison', () => {
    const result = service.runABTest({
      testId: 'ab_001',
      nameA: 'Version A',
      nameB: 'Version B',
      scoresA: [0.7, 0.72, 0.68, 0.75, 0.71, 0.73, 0.69, 0.74],
      scoresB: [0.8, 0.82, 0.78, 0.85, 0.81, 0.79, 0.83, 0.84],
      latencyA: [300, 320, 290, 310, 305, 315, 295, 308],
      latencyB: [450, 460, 440, 455, 448, 452, 445, 450],
      costA: [0.0003, 0.0003, 0.0003, 0.0003, 0.0003, 0.0003, 0.0003, 0.0003],
      costB: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001],
    });

    expect(result.winner).toBeDefined();
    expect(['A', 'B', 'tie']).toContain(result.winner);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.effectSize).toBeGreaterThan(0);
    expect(result.recommendation.length).toBeGreaterThan(0);
    expect(result.recommendationZh.length).toBeGreaterThan(0);

    // Metrics
    expect(result.metricsA.avgScore).toBeGreaterThan(0);
    expect(result.metricsB.avgScore).toBeGreaterThan(0);
    expect(result.metricsA.avgLatency).toBeGreaterThan(0);
    expect(result.metricsB.avgLatency).toBeGreaterThan(0);
  });

  it('should detect tie when scores are similar', () => {
    const result = service.runABTest({
      testId: 'ab_tie',
      nameA: 'Same A',
      nameB: 'Same B',
      scoresA: [0.75, 0.76, 0.74],
      scoresB: [0.75, 0.76, 0.74],
      latencyA: [300, 300, 300],
      latencyB: [300, 300, 300],
      costA: [0.0003, 0.0003, 0.0003],
      costB: [0.0003, 0.0003, 0.0003],
    });

    expect(result.winner).toBe('tie');
  });

  it('should declare B as winner when B scores higher', () => {
    const result = service.runABTest({
      testId: 'ab_b_wins',
      nameA: 'Low',
      nameB: 'High',
      scoresA: [0.5, 0.52, 0.48],
      scoresB: [0.9, 0.92, 0.88],
      latencyA: [300, 300, 300],
      latencyB: [300, 300, 300],
      costA: [0.0001, 0.0001, 0.0001],
      costB: [0.0001, 0.0001, 0.0001],
    });

    expect(result.winner).toBe('B');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

// ============================================
// Cost Comparison Tests
// ============================================

describe('ExperimentService — Cost Comparison', () => {
  it('should compare costs between variants', () => {
    const exp = service.createPromptExperiment({
      name: 'Cost Test',
      description: 'Testing',
      variants: samplePromptVariants,
      testCases: sampleTestCases,
    });
    service.runPromptExperiment(exp.id);

    const costComp = service.compareCosts(exp.id);

    expect(costComp.experimentId).toBe(exp.id);
    expect(costComp.variants).toHaveLength(3);
    expect(costComp.cheapest).toBeTruthy();
    expect(costComp.mostExpensive).toBeTruthy();
    expect(costComp.costPerRunDiff).toBeGreaterThanOrEqual(0);
    expect(costComp.recommendation.length).toBeGreaterThan(0);
    expect(costComp.recommendationZh.length).toBeGreaterThan(0);

    // Cost ranks should be sequential 1, 2, 3
    const ranks = costComp.variants.map(v => v.costRank).sort();
    expect(ranks).toEqual([1, 2, 3]);
  });

  it('should handle no results gracefully', () => {
    const exp = service.createPromptExperiment({
      name: 'Empty',
      description: 'No results yet',
      variants: samplePromptVariants,
      testCases: sampleTestCases,
    });

    const costComp = service.compareCosts(exp.id);
    expect(costComp.cheapest).toBe('N/A');
    expect(costComp.mostExpensive).toBe('N/A');
  });
});

// ============================================
// Report Tests
// ============================================

describe('ExperimentService — Reports', () => {
  it('should generate an experiment report', () => {
    const exp = service.createModelExperiment({
      name: 'Report Test',
      description: 'Testing',
      models: sampleModels,
      testCases: sampleTestCases,
    });
    service.runModelExperiment(exp.id);

    const report = service.generateReport(exp.id);

    expect(report.reportId).toContain('report_');
    expect(report.experimentName).toBe('Report Test');
    expect(report.status).toBe('completed');
    expect(report.summary.totalVariants).toBe(3);
    expect(report.summary.totalRuns).toBeGreaterThan(0);
    expect(report.summary.winner).toBeTruthy();
    expect(report.successMetrics.experimentSuccess).toBeDefined();
    expect(report.successMetrics.overallScore).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendationsZh.length).toBeGreaterThan(0);
  });

  it('should generate a recommendation report', () => {
    const exp = service.createModelExperiment({
      name: 'Rec Report Test',
      description: 'Testing',
      models: sampleModels,
      testCases: sampleTestCases,
    });
    service.runModelExperiment(exp.id);

    const recReport = service.generateRecommendationReport(exp.id);

    expect(recReport.reportId).toContain('rec_');
    expect(recReport.topPicks.length).toBeGreaterThan(0);
    expect(recReport.topPicks[0].rank).toBe(1);
    expect(recReport.topPicks[0].reason.length).toBeGreaterThan(0);
    expect(recReport.topPicks[0].reasonZh.length).toBeGreaterThan(0);
    expect(recReport.actionItems).toHaveLength(4);
    expect(recReport.actionItemsZh).toHaveLength(4);
    expect(recReport.riskFactors.length).toBeGreaterThan(0);
    expect(recReport.riskFactorsZh.length).toBeGreaterThan(0);
    expect(recReport.costAnalysis.length).toBeGreaterThan(0);
  });

  it('should generate report for learning experiment', () => {
    const exp = service.createLearningExperiment({
      name: 'Learning Report',
      description: 'Testing',
      groups: sampleGroups,
      preTestId: 'pre_003',
      postTestId: 'post_003',
      duration: '6 weeks',
    });
    service.runLearningExperiment(exp.id);

    const report = service.generateReport(exp.id);
    expect(report.experimentType).toBe('learning');
    expect(report.summary.totalVariants).toBe(3);
    expect(report.successMetrics.experimentSuccess).toBeDefined();
  });
});

// ============================================
// Management Tests
// ============================================

describe('ExperimentService — Management', () => {
  it('should list all experiments', () => {
    service.createPromptExperiment({
      name: 'Exp 1', description: 'First',
      variants: samplePromptVariants.slice(0, 2),
      testCases: sampleTestCases,
    });
    service.createModelExperiment({
      name: 'Exp 2', description: 'Second',
      models: sampleModels.slice(0, 2),
      testCases: sampleTestCases,
    });

    const list = service.listExperiments();
    expect(list).toHaveLength(2);
  });

  it('should get a specific experiment', () => {
    const exp = service.createPromptExperiment({
      name: 'Get Test',
      description: 'Testing',
      variants: samplePromptVariants.slice(0, 2),
      testCases: sampleTestCases,
    });

    const found = service.getExperiment(exp.id);
    expect(found).toBeTruthy();
    expect(found!.config.name).toBe('Get Test');
  });

  it('should return null for non-existent experiment', () => {
    expect(service.getExperiment('nonexistent')).toBeNull();
  });

  it('should cancel an experiment', () => {
    const exp = service.createPromptExperiment({
      name: 'Cancel Test',
      description: 'Testing',
      variants: samplePromptVariants.slice(0, 2),
      testCases: sampleTestCases,
    });

    const cancelled = service.cancelExperiment(exp.id);
    expect(cancelled.config.status).toBe('cancelled');
  });

  it('should clear all data', () => {
    service.createPromptExperiment({
      name: 'Clear Test',
      description: 'Testing',
      variants: samplePromptVariants.slice(0, 2),
      testCases: sampleTestCases,
    });

    service.clearData();
    expect(service.listExperiments()).toHaveLength(0);
  });

  it('should return all data for persistence', () => {
    service.createPromptExperiment({
      name: 'Persist Test',
      description: 'Testing',
      variants: samplePromptVariants.slice(0, 2),
      testCases: sampleTestCases,
    });

    const allData = service.getAllData();
    expect(allData).toHaveLength(1);
    expect(allData[0].config.name).toBe('Persist Test');
  });
});

// ============================================
// Edge Cases
// ============================================

describe('ExperimentService — Edge Cases', () => {
  it('should handle single variant prompt experiment', () => {
    const exp = service.createPromptExperiment({
      name: 'Single Variant',
      description: 'Only one',
      variants: [samplePromptVariants[0]],
      testCases: sampleTestCases,
    });

    const result = service.runPromptExperiment(exp.id);
    expect(result.variantResults).toHaveLength(1);
    expect(result.abComparison).toBeNull();
  });

  it('should handle empty test cases gracefully', () => {
    const exp = service.createPromptExperiment({
      name: 'No Tests',
      description: 'Empty',
      variants: samplePromptVariants.slice(0, 2),
      testCases: [],
    });

    const result = service.runPromptExperiment(exp.id);
    expect(result.variantResults).toHaveLength(2);
    result.variantResults.forEach(v => {
      expect(v.sampleSize).toBe(0);
    });
  });

  it('should handle single temperature value', () => {
    const exp = service.createTemperatureExperiment({
      name: 'Single Temp',
      description: 'One temperature',
      modelProvider: 'deepseek',
      modelName: 'deepseek-chat',
      temperatures: [0.5],
      testCases: sampleTestCases,
    });

    const result = service.runTemperatureExperiment(exp.id);
    expect(result.tempResults).toHaveLength(1);
    expect(result.optimalTemperature).toBe(0.5);
  });

  it('should handle single group learning experiment', () => {
    const exp = service.createLearningExperiment({
      name: 'Single Group',
      description: 'One group only',
      groups: [sampleGroups[0]],
      preTestId: 'pre_x',
      postTestId: 'post_x',
      duration: '1 week',
    });

    const result = service.runLearningExperiment(exp.id);
    expect(result.groupResults).toHaveLength(1);
    expect(result.learningGain.comparisonTable).toHaveLength(1);
  });
});
