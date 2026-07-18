// Sprint 17: Metrics — counters, histograms, timers
import { logger } from '@/shared/logger/logger';

// ============================================
// Types
// ============================================

export interface MetricSnapshot {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  values: Record<string, number>;
  timestamp: Date;
}

// ============================================
// Counters
// ============================================

const counters = new Map<string, number>();
const labels = new Map<string, Map<string, number>>();

export function incrementCounter(name: string, value = 1, label?: Record<string, string>): void {
  const key = label ? `${name}:${JSON.stringify(label)}` : name;
  counters.set(key, (counters.get(key) ?? 0) + value);
}

export function getCounter(name: string, label?: Record<string, string>): number {
  const key = label ? `${name}:${JSON.stringify(label)}` : name;
  return counters.get(key) ?? 0;
}

// ============================================
// Histograms (for latency distribution)
// ============================================

const histograms = new Map<string, number[]>();

const BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000]; // ms

export function recordHistogram(name: string, valueMs: number): void {
  if (!histograms.has(name)) histograms.set(name, []);
  histograms.get(name)!.push(valueMs);
}

export function getHistogram(name: string): { count: number; p50: number; p95: number; p99: number; avg: number; max: number } {
  const values = histograms.get(name) ?? [];
  if (values.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);

  return { count: values.length, p50, p95, p99, avg, max: sorted[sorted.length - 1] };
}

// ============================================
// Gauges (current value, can go up and down)
// ============================================

const gauges = new Map<string, number>();

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

export function getGauge(name: string): number {
  return gauges.get(name) ?? 0;
}

// ============================================
// Timer — measure function execution time
// ============================================

export async function timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const elapsed = performance.now() - start;
    recordHistogram(name, elapsed);
    incrementCounter(`${name}:count`);
    logger.debug({ module: 'metrics', metric: name, elapsedMs: Math.round(elapsed) }, 'Timer');
  }
}

export function timeSync<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    const elapsed = performance.now() - start;
    recordHistogram(name, elapsed);
    incrementCounter(`${name}:count`);
  }
}

// ============================================
// Snapshot / Export
// ============================================

export function getAllMetrics(): MetricSnapshot[] {
  const snapshots: MetricSnapshot[] = [];

  for (const [key, value] of counters) {
    snapshots.push({ name: key, type: 'counter', values: { '': value }, timestamp: new Date() });
  }
  for (const [name, values] of histograms) {
    const h = getHistogram(name);
    snapshots.push({ name, type: 'histogram', values: { count: h.count, p50: h.p50, p95: h.p95, p99: h.p99, avg: h.avg, max: h.max }, timestamp: new Date() });
  }
  for (const [key, value] of gauges) {
    snapshots.push({ name: key, type: 'gauge', values: { '': value }, timestamp: new Date() });
  }

  return snapshots;
}

export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
  gauges.clear();
}
