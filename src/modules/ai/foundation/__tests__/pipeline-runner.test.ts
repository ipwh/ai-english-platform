// ============================================
// PipelineRunner Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { PipelineRunner, type PipelineConfig } from '../runner/pipeline-runner';
import type { ValidationResult } from '../types';

interface TestInput {
  items: number[];
}

interface TestPrepared {
  items: number[];
  multiplier: number;
}

interface TestExecuted {
  results: number[];
}

interface TestAggregated {
  sum: number;
  count: number;
  average: number;
}

interface TestReport {
  summary: string;
  average: number;
}

describe('PipelineRunner', () => {
  function createConfig(shouldFail?: 'validate' | 'prepare' | 'execute' | 'aggregate' | 'report'): PipelineConfig<TestInput, TestPrepared, TestExecuted, TestAggregated, TestReport> {
    return {
      name: 'TestPipeline',
      validate: (input: TestInput): ValidationResult => {
        if (shouldFail === 'validate') {
          return { valid: false, errors: ['Invalid input'], warnings: [] };
        }
        if (input.items.length === 0) {
          return { valid: false, errors: ['No items provided'], warnings: [] };
        }
        return { valid: true, errors: [], warnings: [] };
      },
      prepare: async (input: TestInput): Promise<TestPrepared> => {
        if (shouldFail === 'prepare') throw new Error('Prepare failed');
        return { items: input.items, multiplier: 2 };
      },
      execute: async (prepared: TestPrepared): Promise<TestExecuted> => {
        if (shouldFail === 'execute') throw new Error('Execute failed');
        return { results: prepared.items.map(n => n * prepared.multiplier) };
      },
      aggregate: async (executed: TestExecuted): Promise<TestAggregated> => {
        if (shouldFail === 'aggregate') throw new Error('Aggregate failed');
        const sum = executed.results.reduce((a, b) => a + b, 0);
        return {
          sum,
          count: executed.results.length,
          average: sum / executed.results.length,
        };
      },
      persist: async (aggregated: TestAggregated): Promise<void> => {
        // no-op for testing
      },
      report: async (aggregated: TestAggregated): Promise<TestReport> => {
        if (shouldFail === 'report') throw new Error('Report failed');
        return {
          summary: `Processed ${aggregated.count} items`,
          average: aggregated.average,
        };
      },
    };
  }

  // ── Happy Path ──

  it('should execute all stages in order', async () => {
    const pipeline = new PipelineRunner(createConfig());
    const result = await pipeline.run({ items: [1, 2, 3] });

    expect(result.success).toBe(true);
    expect(result.data!.average).toBe(4); // (2+4+6)/3 = 4
    expect(result.data!.summary).toBe('Processed 3 items');
  });

  it('should record step metrics', async () => {
    const pipeline = new PipelineRunner(createConfig());
    const result = await pipeline.run({ items: [1, 2] });

    expect(result.success).toBe(true);
    const stepNames = result.stepMetrics.map(s => s.step);
    expect(stepNames).toEqual(['validate', 'prepare', 'execute', 'aggregate', 'persist', 'report']);
  });

  it('should record timing for each step', async () => {
    const pipeline = new PipelineRunner(createConfig());
    const result = await pipeline.run({ items: [1] });

    for (const metric of result.stepMetrics) {
      expect(metric.durationMs).toBeGreaterThanOrEqual(0);
      expect(metric.success).toBe(true);
    }
  });

  it('should record total duration', async () => {
    const pipeline = new PipelineRunner(createConfig());
    const result = await pipeline.run({ items: [1] });
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  // ── Validation Failure ──

  it('should short-circuit on validation failure', async () => {
    const pipeline = new PipelineRunner(createConfig());
    const result = await pipeline.run({ items: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No items');
    // Only validate step ran
    expect(result.stepMetrics.map(s => s.step)).toEqual(['validate']);
  });

  it('should short-circuit on custom validation failure', async () => {
    const pipeline = new PipelineRunner(createConfig('validate'));
    const result = await pipeline.run({ items: [1, 2] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input');
  });

  // ── Stage Failure Propagation ──

  it('should fail on prepare error', async () => {
    const pipeline = new PipelineRunner(createConfig('prepare'));
    const result = await pipeline.run({ items: [1] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Prepare failed');
  });

  it('should fail on execute error', async () => {
    const pipeline = new PipelineRunner(createConfig('execute'));
    const result = await pipeline.run({ items: [1] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Execute failed');
  });

  it('should fail on aggregate error', async () => {
    const pipeline = new PipelineRunner(createConfig('aggregate'));
    const result = await pipeline.run({ items: [1] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Aggregate failed');
  });

  it('should fail on report error', async () => {
    const pipeline = new PipelineRunner(createConfig('report'));
    const result = await pipeline.run({ items: [1] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Report failed');
  });

  // ── Stage Isolation ──

  it('should mark failed step in metrics', async () => {
    const pipeline = new PipelineRunner(createConfig('execute'));
    const result = await pipeline.run({ items: [1] });

    const executeMetric = result.stepMetrics.find(m => m.step === 'execute');
    expect(executeMetric).toBeDefined();
    expect(executeMetric!.success).toBe(false);
  });

  it('should not reach later stages after failure', async () => {
    const pipeline = new PipelineRunner(createConfig('prepare'));
    const result = await pipeline.run({ items: [1] });

    // Only validate and prepare ran (prepare failed)
    const steps = result.stepMetrics.map(s => s.step);
    expect(steps).toEqual(['validate', 'prepare']);
  });

  // ── Skip persist ──

  it('should skip persist stage when not configured', async () => {
    const config = createConfig();
    delete config.persist;
    const pipeline = new PipelineRunner(config);
    const result = await pipeline.run({ items: [1] });

    const stepNames = result.stepMetrics.map(s => s.step);
    expect(stepNames).not.toContain('persist');
  });

  // ── Complex data ──

  it('should handle complex input correctly', async () => {
    const pipeline = new PipelineRunner(createConfig());
    const result = await pipeline.run({ items: [10, 20, 30, 40] });

    expect(result.success).toBe(true);
    expect(result.data!.average).toBe(50); // (20+40+60+80)/4 = 50
    expect(result.data!.summary).toBe('Processed 4 items');
  });
});
