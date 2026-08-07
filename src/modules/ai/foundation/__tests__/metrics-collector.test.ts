// ============================================
// MetricsCollector Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { MetricsCollector, Counter, Gauge, RollingAverage, Timer } from '../metrics/metrics-collector';

describe('Counter', () => {
  it('should start at 0', () => {
    const c = new Counter('test');
    expect(c.get()).toBe(0);
  });

  it('should increment by 1 by default', () => {
    const c = new Counter('test');
    c.inc();
    expect(c.get()).toBe(1);
  });

  it('should increment by custom delta', () => {
    const c = new Counter('test');
    c.inc(5);
    expect(c.get()).toBe(5);
  });

  it('should reset to 0', () => {
    const c = new Counter('test');
    c.inc(10);
    c.reset();
    expect(c.get()).toBe(0);
  });

  it('should produce snapshots', () => {
    const c = new Counter('evals_total', { prompt: 'reading' });
    c.inc(3);
    const snap = c.snapshot();
    expect(snap.name).toBe('evals_total');
    expect(snap.value).toBe(3);
    expect(snap.labels.prompt).toBe('reading');
    expect(snap.timestamp).toBeTruthy();
  });
});

describe('Gauge', () => {
  it('should start at 0', () => {
    const g = new Gauge('test');
    expect(g.get()).toBe(0);
  });

  it('should set absolute value', () => {
    const g = new Gauge('test');
    g.set(42);
    expect(g.get()).toBe(42);
  });

  it('should increment and decrement', () => {
    const g = new Gauge('test');
    g.inc(5);
    expect(g.get()).toBe(5);
    g.dec(2);
    expect(g.get()).toBe(3);
  });

  it('should reset', () => {
    const g = new Gauge('test');
    g.set(100);
    g.reset();
    expect(g.get()).toBe(0);
  });

  it('should produce snapshots', () => {
    const g = new Gauge('active_runs', { env: 'prod' });
    g.set(5);
    const snap = g.snapshot();
    expect(snap.value).toBe(5);
    expect(snap.labels.env).toBe('prod');
  });
});

describe('RollingAverage', () => {
  it('should return 0 when empty', () => {
    const ra = new RollingAverage();
    expect(ra.get()).toBe(0);
  });

  it('should compute average', () => {
    const ra = new RollingAverage();
    ra.push(10);
    ra.push(20);
    ra.push(30);
    expect(ra.get()).toBe(20);
  });

  it('should roll off old values', () => {
    const ra = new RollingAverage(3);
    ra.push(100);
    ra.push(0);
    ra.push(0);
    expect(ra.get()).toBeCloseTo(33.33, 0);
    ra.push(0);
    expect(ra.get()).toBe(0); // 100 rolled off
  });

  it('should report count and window', () => {
    const ra = new RollingAverage(5);
    ra.push(1);
    ra.push(2);
    expect(ra.getCount()).toBe(2);
    expect(ra.getWindow()).toEqual([1, 2]);
  });

  it('should reset', () => {
    const ra = new RollingAverage();
    ra.push(10);
    ra.reset();
    expect(ra.get()).toBe(0);
    expect(ra.getCount()).toBe(0);
  });
});

describe('Timer', () => {
  it('should time sync functions', () => {
    const timer = new Timer('test_latency');
    const { result, durationMs } = timer.timeSync(() => 42);
    expect(result).toBe(42);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should time async functions', async () => {
    const timer = new Timer('test_latency');
    const { result, durationMs } = await timer.timeAsync(async () => 'hello');
    expect(result).toBe('hello');
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should track mean duration', () => {
    const timer = new Timer('test_latency');
    timer.timeSync(() => { /* no-op */ });
    timer.timeSync(() => { /* no-op */ });
    expect(timer.getMean()).toBeGreaterThanOrEqual(0);
  });

  it('should produce snapshots', () => {
    const timer = new Timer('eval_latency_ms');
    timer.timeSync(() => 1);
    const snap = timer.snapshot();
    expect(snap.name).toBe('eval_latency_ms');
    expect(snap.timestamp).toBeTruthy();
  });

  it('should reset', () => {
    const timer = new Timer('test_latency');
    timer.timeSync(() => 1);
    timer.reset();
    expect(timer.getMean()).toBe(0);
  });
});

describe('MetricsCollector', () => {
  it('should create and reuse counters', () => {
    const collector = new MetricsCollector();
    const c1 = collector.counter('test');
    const c2 = collector.counter('test');
    expect(c1).toBe(c2); // same instance returned
  });

  it('should create and reuse gauges', () => {
    const collector = new MetricsCollector();
    const g1 = collector.gauge('test');
    const g2 = collector.gauge('test');
    expect(g1).toBe(g2);
  });

  it('should create and reuse histograms', () => {
    const collector = new MetricsCollector();
    const h1 = collector.histogram('test');
    const h2 = collector.histogram('test');
    expect(h1).toBe(h2);
  });

  it('should create and reuse timers', () => {
    const collector = new MetricsCollector();
    const t1 = collector.timer('test');
    const t2 = collector.timer('test');
    expect(t1).toBe(t2);
  });

  it('should create and reuse rolling averages', () => {
    const collector = new MetricsCollector();
    const r1 = collector.rollingAverage('test');
    const r2 = collector.rollingAverage('test');
    expect(r1).toBe(r2);
  });

  it('should differentiate metrics by labels', () => {
    const collector = new MetricsCollector();
    const c1 = collector.counter('test', { prompt: 'reading' });
    const c2 = collector.counter('test', { prompt: 'writing' });
    expect(c1).not.toBe(c2);
  });

  it('should export all metrics', () => {
    const collector = new MetricsCollector();
    collector.counter('evals').inc(5);
    collector.gauge('active').set(3);
    collector.histogram('latency').observe(100);
    collector.timer('response_time').timeSync(() => 1);

    const snapshots = collector.export();
    expect(snapshots.length).toBeGreaterThanOrEqual(3);
  });

  it('should reset all metrics', () => {
    const collector = new MetricsCollector();
    const c = collector.counter('evals');
    c.inc(10);
    collector.reset();
    expect(c.get()).toBe(0);
  });
});
