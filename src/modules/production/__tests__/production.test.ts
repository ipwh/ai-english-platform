// Sprint 29: Production Readiness — Unit Tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CircuitBreaker, withRetry, aiQueue,
  isFeatureEnabled, setFeatureFlag, getAllFeatureFlags,
  healthCheck, readinessCheck,
} from '../services/production-ready';

beforeEach(() => {
  CircuitBreaker.resetAll();
});

describe('CircuitBreaker', () => {
  it('should execute successfully when closed', async () => {
    const cb = new CircuitBreaker('test-cb');
    const result = await cb.execute(async () => 'success');
    expect(result).toBe('success');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('should open after threshold failures', async () => {
    const cb = new CircuitBreaker('test-cb2', { failureThreshold: 2, resetTimeoutMs: 60000, halfOpenMaxRequests: 1 });
    for (let i = 0; i < 3; i++) {
      try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    }
    expect(cb.getState()).toBe('OPEN');
  });

  it('should throw when open', async () => {
    const cb = new CircuitBreaker('test-cb3', { failureThreshold: 1, resetTimeoutMs: 60000, halfOpenMaxRequests: 1 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
    await expect(cb.execute(async () => 'ok')).rejects.toThrow('OPEN');
  });

  it('should reset on success', async () => {
    const cb = new CircuitBreaker('test-cb4');
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getFailureCount()).toBe(0);
  });

  it('should have unique state per name', () => {
    const cb1 = new CircuitBreaker('unique-1');
    const cb2 = new CircuitBreaker('unique-2');
    expect(cb1.getState()).toBe('CLOSED');
    expect(cb2.getState()).toBe('CLOSED');
  });
});

describe('RetryStrategy', () => {
  it('should return result on first success', async () => {
    const result = await withRetry(async () => 'ok', { maxRetries: 2 });
    expect(result).toBe('ok');
  });

  it('should retry on failure and succeed', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return 'recovered';
    }, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
  });

  it('should throw after max retries', async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts++;
      throw new Error('always fails');
    }, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow('always fails');
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it('should respect retryOn predicate', async () => {
    await expect(withRetry(async () => {
      throw new Error('non-retryable');
    }, { maxRetries: 2, baseDelayMs: 1, retryOn: (e) => e.message === 'retryable' })).rejects.toThrow('non-retryable');
  });
});

describe('AIRequestQueue', () => {
  it('should process tasks in order', async () => {
    const results: number[] = [];
    const p1 = aiQueue.enqueue(async () => { results.push(1); return 1; });
    const p2 = aiQueue.enqueue(async () => { results.push(2); return 2; });
    await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
  });

  it('should return task result', async () => {
    const result = await aiQueue.enqueue(async () => 42);
    expect(result).toBe(42);
  });

  it('should propagate errors', async () => {
    await expect(aiQueue.enqueue(async () => { throw new Error('task error'); })).rejects.toThrow('task error');
  });
});

describe('FeatureFlags', () => {
  it('should return default values', () => {
    expect(isFeatureEnabled('rag-enabled')).toBe(false);
    expect(isFeatureEnabled('ai-cache-enabled')).toBe(true);
  });

  it('should set and get flags', () => {
    setFeatureFlag('test-flag', true);
    expect(isFeatureEnabled('test-flag')).toBe(true);
    setFeatureFlag('test-flag', false);
    expect(isFeatureEnabled('test-flag')).toBe(false);
  });

  it('should return all flags', () => {
    const all = getAllFeatureFlags();
    expect(all['rag-enabled']).toBe(false);
    expect(all['ai-cache-enabled']).toBe(true);
  });
});

describe('HealthCheck', () => {
  it('should return health status', async () => {
    const result = await healthCheck();
    expect(result.status).toBeTruthy();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.checks.ai).toBeDefined();
  });

  it('should return readiness status', async () => {
    const result = await readinessCheck();
    expect(typeof result.ready).toBe('boolean');
    expect(result.checks.ai).toBeDefined();
  });
});
