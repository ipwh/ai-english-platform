// ============================================
// Histogram Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { Histogram } from '../metrics/metrics-collector';

describe('Histogram', () => {
  // ── Basic Observations ──

  it('should start with zero observations', () => {
    const h = new Histogram('test');
    expect(h.getCount()).toBe(0);
    expect(h.getSum()).toBe(0);
    expect(h.getMean()).toBe(0);
  });

  it('should record observations', () => {
    const h = new Histogram('test');
    h.observe(1);
    h.observe(2);
    h.observe(3);
    expect(h.getCount()).toBe(3);
    expect(h.getSum()).toBe(6);
    expect(h.getMean()).toBe(2);
  });

  it('should track min and max', () => {
    const h = new Histogram('test');
    h.observe(5);
    h.observe(1);
    h.observe(10);
    expect(h.getMin()).toBe(1);
    expect(h.getMax()).toBe(10);
  });

  it('should return 0 for min/max when empty', () => {
    const h = new Histogram('test');
    expect(h.getMin()).toBe(0);
    expect(h.getMax()).toBe(0);
  });

  // ── Percentiles ──

  it('should compute p50 (median)', () => {
    const h = new Histogram('test');
    // With default buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, +Inf
    h.observe(0.3);
    h.observe(0.7);
    h.observe(2.0);
    // p50 should fall into the bucket containing the middle element
    expect(h.getPercentile(50)).toBeGreaterThan(0);
  });

  it('should compute p90, p95, p99', () => {
    const h = new Histogram('test');
    for (let i = 0; i < 100; i++) {
      h.observe(i * 0.05); // values 0 to 4.95
    }
    expect(h.getPercentile(90)).toBeGreaterThan(0);
    expect(h.getPercentile(95)).toBeGreaterThan(0);
    expect(h.getPercentile(99)).toBeGreaterThan(0);
    // p90 should be at least >= p50
    expect(h.getPercentile(90)).toBeGreaterThanOrEqual(h.getPercentile(50));
    // p99 should be at least >= p90
    expect(h.getPercentile(99)).toBeGreaterThanOrEqual(h.getPercentile(90));
  });

  // ── Edge Cases ──

  it('should handle one observation', () => {
    const h = new Histogram('test');
    h.observe(42);
    expect(h.getCount()).toBe(1);
    expect(h.getMean()).toBe(42);
    expect(h.getMin()).toBe(42);
    expect(h.getMax()).toBe(42);
  });

  it('should handle duplicate values', () => {
    const h = new Histogram('test');
    h.observe(1);
    h.observe(1);
    h.observe(1);
    expect(h.getCount()).toBe(3);
    expect(h.getMean()).toBe(1);
    expect(h.getMin()).toBe(1);
    expect(h.getMax()).toBe(1);
  });

  it('should handle large values', () => {
    const h = new Histogram('test');
    h.observe(999999);
    expect(h.getCount()).toBe(1);
    expect(h.getMax()).toBe(999999);
  });

  it('should handle zero values', () => {
    const h = new Histogram('test');
    h.observe(0);
    expect(h.getCount()).toBe(1);
    expect(h.getMean()).toBe(0);
  });

  // ── Export ──

  it('should export full histogram data', () => {
    const h = new Histogram('test', [1, 5, 10]);
    h.observe(3);
    h.observe(7);
    const exported = h.export();
    expect(exported.count).toBe(2);
    expect(exported.sum).toBe(10);
    expect(exported.mean).toBe(5);
    expect(exported.min).toBe(3);
    expect(exported.max).toBe(7);
    expect(exported.buckets).toBeDefined();
    expect(exported.p50).toBeGreaterThan(0);
  });

  // ── Snapshot ──

  it('should export snapshot with correct name', () => {
    const h = new Histogram('eval_latency');
    h.observe(100);
    const snap = h.snapshot();
    expect(snap.name).toBe('eval_latency');
    expect(snap.value).toBeGreaterThan(0);
    expect(snap.timestamp).toBeTruthy();
  });

  // ── Reset ──

  it('should reset all values', () => {
    const h = new Histogram('test');
    h.observe(1);
    h.observe(2);
    h.observe(3);
    h.reset();
    expect(h.getCount()).toBe(0);
    expect(h.getSum()).toBe(0);
    expect(h.getMin()).toBe(0);
    expect(h.getMax()).toBe(0);
  });

  // ── Custom Buckets ──

  it('should accept custom bucket bounds', () => {
    const h = new Histogram('test', [0.5, 1, 2]);
    h.observe(0.3);
    h.observe(0.7);
    h.observe(1.5);
    h.observe(3); // goes to +Inf
    expect(h.getCount()).toBe(4);
  });
});
