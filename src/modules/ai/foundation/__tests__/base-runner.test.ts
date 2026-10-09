// ============================================
// BaseRunner Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { BaseRunner, type RunnerContext } from '../runner/base-runner';

interface TestInput {
  value: number;
  shouldFail?: boolean;
}

interface TestOutput {
  result: number;
}

type TestOptions = { multiplier?: number };

/**
 * Concrete runner for testing the base lifecycle.
 * Records lifecycle events so we can verify order.
 */
class TestRunner extends BaseRunner<TestInput, TestOutput, TestOptions> {
  public lifecycleEvents: string[] = [];

  protected async beforeRun(
    _context: RunnerContext,
    _input: TestInput,
    _options?: TestOptions,
  ): Promise<void> {
    this.lifecycleEvents.push('beforeRun');
  }

  protected async execute(
    _context: RunnerContext,
    input: TestInput,
    options?: TestOptions,
  ): Promise<TestOutput> {
    this.lifecycleEvents.push('execute');
    if (input.shouldFail) {
      throw new Error('Simulated failure');
    }
    return { result: input.value * (options?.multiplier ?? 1) };
  }

  protected async afterRun(
    _context: RunnerContext,
    _output: TestOutput,
  ): Promise<void> {
    this.lifecycleEvents.push('afterRun');
  }

  protected async onError(
    _context: RunnerContext,
    _error: { message: string; stage: string; cause?: unknown },
  ): Promise<void> {
    this.lifecycleEvents.push('onError');
  }

  protected async cleanup(_context: RunnerContext): Promise<void> {
    this.lifecycleEvents.push('cleanup');
  }
}

describe('BaseRunner', () => {
  // ── Happy Path ──

  it('should execute lifecycle in order: beforeRun → execute → afterRun → cleanup', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 5 } });

    expect(result.success).toBe(true);
    expect(result.data!.result).toBe(5);
    expect(runner.lifecycleEvents).toEqual([
      'beforeRun', 'execute', 'afterRun', 'cleanup',
    ]);
  });

  it('should pass options to execute', async () => {
    const runner = new TestRunner();
    const result = await runner.run({
      input: { value: 5 },
      options: { multiplier: 10 },
    });

    expect(result.success).toBe(true);
    expect(result.data!.result).toBe(50);
  });

  it('should auto-generate a runId', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 1 } });
    expect(result.context.runId).toBeTruthy();
    expect(result.context.runId).toMatch(/^run-/);
  });

  it('should accept a custom runId', async () => {
    const runner = new TestRunner();
    const result = await runner.run({
      input: { value: 1 },
      runId: 'custom-run-123',
    });
    expect(result.context.runId).toBe('custom-run-123');
  });

  it('should record timing metadata', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 1 } });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.context.startedAt).toBeTruthy();
  });

  it('should attach metadata to context', async () => {
    const runner = new TestRunner();
    const result = await runner.run({
      input: { value: 1 },
      metadata: { traceId: 'abc-123' },
    });
    expect(result.context.metadata.traceId).toBe('abc-123');
  });

  // ── Error Path ──

  it('should execute lifecycle on failure: beforeRun → execute → onError → cleanup', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 1, shouldFail: true } });

    expect(result.success).toBe(false);
    expect(result.error!.message).toBe('Simulated failure');
    expect(runner.lifecycleEvents).toEqual([
      'beforeRun', 'execute', 'onError', 'cleanup',
    ]);
  });

  it('should NOT call afterRun after a failed execute', async () => {
    const runner = new TestRunner();
    await runner.run({ input: { value: 1, shouldFail: true } });
    expect(runner.lifecycleEvents).not.toContain('afterRun');
  });

  it('should return error info on failure', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 1, shouldFail: true } });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('Simulated failure');
  });

  // ── Cleanup guarantee ──

  it('should execute cleanup even when execute throws', async () => {
    const runner = new TestRunner();
    await runner.run({ input: { value: 1, shouldFail: true } });
    expect(runner.lifecycleEvents).toContain('cleanup');
  });

  it('should execute cleanup even when beforeRun throws', async () => {
    class FailingBeforeRunner extends TestRunner {
      protected async beforeRun(): Promise<void> {
        this.lifecycleEvents.push('beforeRun');
        throw new Error('beforeRun failed');
      }
    }
    const runner = new FailingBeforeRunner();
    await runner.run({ input: { value: 1 } });
    // The error is caught in execute stage (beforeRun throws inside try)
    // Cleanup should still run
    expect(runner.lifecycleEvents).toContain('cleanup');
  });

  // ── Return values ──

  it('should return data on success', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 42 } });
    expect(result.data).toBeDefined();
    expect(result.data!.result).toBe(42);
  });

  it('should return undefined data on failure', async () => {
    const runner = new TestRunner();
    const result = await runner.run({ input: { value: 1, shouldFail: true } });
    expect(result.data).toBeUndefined();
  });
});
