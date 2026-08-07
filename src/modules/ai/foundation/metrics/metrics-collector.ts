// ============================================
// MetricsCollector — Reusable metrics collection
// with Counter, Gauge, Histogram, Timer, and
// rolling average support.
//
// All PromptOps modules use this for consistent
// metric collection and snapshot export.
// ============================================

import type { MetricSnapshot } from '../types';

// ── Counter ──

/**
 * A monotonically increasing counter.
 * Thread-safe for single-threaded JS environments.
 */
export class Counter {
  private value = 0;
  private readonly labels: Record<string, string>;

  constructor(name: string, labels: Record<string, string> = {}) {
    this.labels = { name, ...labels };
  }

  /** Increment by 1 (or a custom delta). Rejects non-finite values. */
  inc(delta = 1): number {
    if (!Number.isFinite(delta)) {
      throw new Error(`Counter increment must be a finite number, received ${delta}`);
    }
    this.value += delta;
    return this.value;
  }

  /** Get current value */
  get(): number {
    return this.value;
  }

  /** Reset to zero */
  reset(): void {
    this.value = 0;
  }

  /** Export as a metric snapshot */
  snapshot(): MetricSnapshot {
    return {
      name: this.labels['name'] ?? 'counter',
      value: this.value,
      labels: { ...this.labels },
      timestamp: new Date().toISOString(),
    };
  }
}

// ── Gauge ──

/**
 * A gauge that can go up and down.
 */
export class Gauge {
  private value = 0;
  private readonly labels: Record<string, string>;

  constructor(name: string, labels: Record<string, string> = {}) {
    this.labels = { name, ...labels };
  }

  /** Set absolute value. Rejects non-finite values. */
  set(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Gauge value must be a finite number, received ${value}`);
    }
    this.value = value;
  }

  /** Increment by delta. Rejects non-finite deltas. */
  inc(delta = 1): number {
    if (!Number.isFinite(delta)) {
      throw new Error(`Gauge increment must be a finite number, received ${delta}`);
    }
    this.value += delta;
    return this.value;
  }

  /** Decrement by delta. Rejects non-finite deltas. */
  dec(delta = 1): number {
    if (!Number.isFinite(delta)) {
      throw new Error(`Gauge decrement must be a finite number, received ${delta}`);
    }
    this.value -= delta;
    return this.value;
  }

  /** Get current value */
  get(): number {
    return this.value;
  }

  /** Reset to zero */
  reset(): void {
    this.value = 0;
  }

  /** Export as a metric snapshot */
  snapshot(): MetricSnapshot {
    return {
      name: this.labels['name'] ?? 'gauge',
      value: this.value,
      labels: { ...this.labels },
      timestamp: new Date().toISOString(),
    };
  }
}

// ── Histogram ──

/**
 * A histogram for tracking value distributions.
 * Uses pre-defined buckets for efficiency.
 */
export class Histogram {
  private buckets: Map<number, number> = new Map();
  private count = 0;
  private sum = 0;
  private minValue = Infinity;
  private maxValue = -Infinity;
  private readonly labels: Record<string, string>;
  private readonly bucketUpperBounds: number[];

  constructor(
    name: string,
    bucketUpperBounds: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels: Record<string, string> = {},
  ) {
    this.labels = { name, ...labels };
    this.bucketUpperBounds = [...bucketUpperBounds].sort((a, b) => a - b);

    // Initialize buckets
    for (const bound of this.bucketUpperBounds) {
      this.buckets.set(bound, 0);
    }
    this.buckets.set(Infinity, 0);
  }

  /** Observe a value. Rejects non-finite observations (NaN, Infinity). */
  observe(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Histogram observation must be a finite number, received ${value}`);
    }
    this.count++;
    this.sum += value;

    if (value < this.minValue) this.minValue = value;
    if (value > this.maxValue) this.maxValue = value;

    // Find the right bucket
    for (const bound of this.bucketUpperBounds) {
      if (value <= bound) {
        this.buckets.set(bound, (this.buckets.get(bound) ?? 0) + 1);
        return;
      }
    }

    // Falls into the +Inf bucket
    this.buckets.set(Infinity, (this.buckets.get(Infinity) ?? 0) + 1);
  }

  /** Get the number of observations */
  getCount(): number {
    return this.count;
  }

  /** Get the sum of all observations */
  getSum(): number {
    return this.sum;
  }

  /** Get the average (mean) of all observations */
  getMean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /** Get the minimum observed value */
  getMin(): number {
    return this.count === 0 ? 0 : this.minValue;
  }

  /** Get the maximum observed value */
  getMax(): number {
    return this.count === 0 ? 0 : this.maxValue;
  }

  /** Get a percentile (approximate using buckets) */
  getPercentile(p: number): number {
    if (this.count === 0) return 0;
    const target = (p / 100) * this.count;
    let cumulative = 0;

    for (const bound of this.bucketUpperBounds) {
      cumulative += this.buckets.get(bound) ?? 0;
      if (cumulative >= target) return bound;
    }

    return this.maxValue;
  }

  /** Reset all values */
  reset(): void {
    this.count = 0;
    this.sum = 0;
    this.minValue = Infinity;
    this.maxValue = -Infinity;
    for (const key of this.buckets.keys()) {
      this.buckets.set(key, 0);
    }
  }

  /** Export as a metric snapshot (exports the mean) */
  snapshot(): MetricSnapshot {
    return {
      name: this.labels['name'] ?? 'histogram',
      value: this.getMean(),
      labels: { ...this.labels },
      timestamp: new Date().toISOString(),
    };
  }

  /** Export full histogram data */
  export(): {
    count: number;
    sum: number;
    mean: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    buckets: Record<string, number>;
  } {
    const bucketObj: Record<string, number> = {};
    for (const [bound, count] of this.buckets) {
      bucketObj[bound === Infinity ? '+Inf' : String(bound)] = count;
    }

    return {
      count: this.count,
      sum: this.sum,
      mean: this.getMean(),
      min: this.getMin(),
      max: this.getMax(),
      p50: this.getPercentile(50),
      p90: this.getPercentile(90),
      p95: this.getPercentile(95),
      p99: this.getPercentile(99),
      buckets: bucketObj,
    };
  }
}

// ── Timer ──

/**
 * A timer for measuring durations.
 * Convenience wrapper around Histogram.
 */
export class Timer {
  private histogram: Histogram;
  private startTimes: Map<string, number> = new Map();

  constructor(name: string, labels: Record<string, string> = {}) {
    this.histogram = new Histogram(name, [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000], labels);
  }

  /** Start timing an operation */
  start(label: string = 'default'): void {
    this.startTimes.set(label, performance.now());
  }

  /** Stop timing and record the duration */
  stop(label: string = 'default'): number {
    const start = this.startTimes.get(label);
    if (start === undefined) return 0;

    const duration = performance.now() - start;
    this.histogram.observe(duration);
    this.startTimes.delete(label);
    return duration;
  }

  /** Time a synchronous function */
  timeSync<T>(fn: () => T): { result: T; durationMs: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    this.histogram.observe(duration);
    return { result, durationMs: duration };
  }

  /** Time an async function */
  async timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    this.histogram.observe(duration);
    return { result, durationMs: duration };
  }

  /** Get the underlying histogram */
  getHistogram(): Histogram {
    return this.histogram;
  }

  /** Get the mean duration */
  getMean(): number {
    return this.histogram.getMean();
  }

  /** Reset all recorded timings */
  reset(): void {
    this.histogram.reset();
    this.startTimes.clear();
  }

  /** Export as a metric snapshot */
  snapshot(): MetricSnapshot {
    return this.histogram.snapshot();
  }
}

// ── Rolling Average ──

/**
 * A rolling (moving) average calculator.
 * Maintains a window of the last N values.
 */
export class RollingAverage {
  private window: number[] = [];
  private sum = 0;
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /** Add a value to the rolling window. Rejects non-finite values. */
  push(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`RollingAverage observation must be a finite number, received ${value}`);
    }
    this.window.push(value);
    this.sum += value;

    if (this.window.length > this.maxSize) {
      const removed = this.window.shift()!;
      this.sum -= removed;
    }
  }

  /** Get the current rolling average */
  get(): number {
    if (this.window.length === 0) return 0;
    return this.sum / this.window.length;
  }

  /** Get the values in the current window */
  getWindow(): number[] {
    return [...this.window];
  }

  /** Get the number of values in the window */
  getCount(): number {
    return this.window.length;
  }

  /** Reset the rolling window */
  reset(): void {
    this.window = [];
    this.sum = 0;
  }
}

// ── Metrics Collector ──

/**
 * Central metrics collector that manages counters,
 * gauges, histograms, and timers with snapshot export.
 *
 * @example
 * ```ts
 * const collector = new MetricsCollector();
 *
 * const evals = collector.counter('evaluations_total');
 * evals.inc();
 *
 * const latency = collector.timer('eval_latency_ms');
 * const { result, durationMs } = await latency.timeAsync(() => runEval());
 *
 * // Export all metrics
 * const snapshots = collector.export();
 * ```
 */
export class MetricsCollector {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private timers = new Map<string, Timer>();
  private rollingAverages = new Map<string, RollingAverage>();

  // ── Factory Methods ──

  /** Get or create a counter */
  counter(name: string, labels: Record<string, string> = {}): Counter {
    const key = this.metricKey(name, labels);
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, labels));
    }
    return this.counters.get(key)!;
  }

  /** Get or create a gauge */
  gauge(name: string, labels: Record<string, string> = {}): Gauge {
    const key = this.metricKey(name, labels);
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, labels));
    }
    return this.gauges.get(key)!;
  }

  /** Get or create a histogram */
  histogram(
    name: string,
    buckets?: number[],
    labels: Record<string, string> = {},
  ): Histogram {
    const key = this.metricKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, buckets, labels));
    }
    return this.histograms.get(key)!;
  }

  /** Get or create a timer */
  timer(name: string, labels: Record<string, string> = {}): Timer {
    const key = this.metricKey(name, labels);
    if (!this.timers.has(key)) {
      this.timers.set(key, new Timer(name, labels));
    }
    return this.timers.get(key)!;
  }

  /** Get or create a rolling average */
  rollingAverage(name: string, maxSize?: number, labels: Record<string, string> = {}): RollingAverage {
    const key = this.metricKey(name, labels);
    if (!this.rollingAverages.has(key)) {
      this.rollingAverages.set(key, new RollingAverage(maxSize));
    }
    return this.rollingAverages.get(key)!;
  }

  // ── Export ──

  /**
   * Export all metrics as snapshots.
   *
   * @returns Array of metric snapshots
   */
  export(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];

    for (const c of this.counters.values()) {
      snapshots.push(c.snapshot());
    }
    for (const g of this.gauges.values()) {
      snapshots.push(g.snapshot());
    }
    for (const h of this.histograms.values()) {
      snapshots.push(h.snapshot());
    }
    for (const t of this.timers.values()) {
      snapshots.push(t.snapshot());
    }

    return snapshots;
  }

  /** Reset all metrics */
  reset(): void {
    for (const c of this.counters.values()) c.reset();
    for (const g of this.gauges.values()) g.reset();
    for (const h of this.histograms.values()) h.reset();
    for (const t of this.timers.values()) t.reset();
    for (const r of this.rollingAverages.values()) r.reset();
  }

  // ── Internal ──

  private metricKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}
