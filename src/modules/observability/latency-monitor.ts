// Sprint 17: Latency Monitor — AI + DB latency tracking
import { recordHistogram, incrementCounter } from './metrics';
import { logger } from '@/shared/logger/logger';

export interface LatencyRecord {
  source: 'ai' | 'db';
  model?: string;
  operation: string;
  durationMs: number;
  timestamp: Date;
  success: boolean;
}

const records: LatencyRecord[] = [];
const MAX_RECORDS = 500;

/** Record an AI call latency */
export function recordAiLatency(model: string, operation: string, durationMs: number, success: boolean): void {
  const record: LatencyRecord = { source: 'ai', model, operation, durationMs, timestamp: new Date(), success };
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, 100);

  recordHistogram(`latency:ai:${model}:${operation}`, durationMs);
  incrementCounter(`latency:ai:${model}:${operation}:count`);
  if (!success) incrementCounter(`latency:ai:${model}:${operation}:errors`);

  if (durationMs > 10000) {
    logger.warn({ module: 'latency', source: 'ai', model, operation, durationMs }, 'Slow AI call');
  }
}

/** Record a DB query latency */
export function recordDbLatency(operation: string, durationMs: number, success: boolean): void {
  const record: LatencyRecord = { source: 'db', operation, durationMs, timestamp: new Date(), success };
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, 100);

  recordHistogram(`latency:db:${operation}`, durationMs);
  incrementCounter(`latency:db:${operation}:count`);
  if (!success) incrementCounter(`latency:db:${operation}:errors`);

  if (durationMs > 5000) {
    logger.warn({ module: 'latency', source: 'db', operation, durationMs }, 'Slow DB query');
  }
}

/** Get AI latency summary */
export function getAiLatencySummary(): { byModel: Record<string, { count: number; avgMs: number; p95Ms: number; errorRate: number }> } {
  const aiRecords = records.filter(r => r.source === 'ai');
  const byModel: Record<string, { durations: number[]; errors: number }> = {};

  for (const r of aiRecords) {
    const key = r.model || 'unknown';
    if (!byModel[key]) byModel[key] = { durations: [], errors: 0 };
    byModel[key].durations.push(r.durationMs);
    if (!r.success) byModel[key].errors++;
  }

  const result: Record<string, { count: number; avgMs: number; p95Ms: number; errorRate: number }> = {};
  for (const [model, data] of Object.entries(byModel)) {
    const sorted = data.durations.sort((a, b) => a - b);
    result[model] = {
      count: sorted.length,
      avgMs: Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length),
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      errorRate: sorted.length > 0 ? Math.round((data.errors / sorted.length) * 100) / 100 : 0,
    };
  }
  return { byModel: result };
}

/** Get all latency records */
export function getLatencyRecords(): LatencyRecord[] { return [...records]; }

/** Reset latency records */
export function resetLatencyMonitor(): void { records.length = 0; }
