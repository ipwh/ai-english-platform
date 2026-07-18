// Sprint 17: Error Monitor — error aggregation and pattern detection
import { incrementCounter } from './metrics';
import { logger } from '@/shared/logger/logger';

export interface ErrorRecord {
  message: string;
  stack?: string;
  source: string;
  timestamp: Date;
  count: number;
}

const errors = new Map<string, ErrorRecord>();
const MAX_ERRORS = 100;

/** Record an error for monitoring */
export function recordError(error: Error, source: string): void {
  const key = `${source}:${error.message}`;
  const existing = errors.get(key);

  if (existing) {
    existing.count++;
    existing.timestamp = new Date();
  } else {
    if (errors.size >= MAX_ERRORS) {
      // Remove oldest
      const oldest = [...errors.entries()].sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) errors.delete(oldest[0]);
    }
    errors.set(key, {
      message: error.message,
      stack: error.stack,
      source,
      timestamp: new Date(),
      count: 1,
    });
  }

  incrementCounter('errors:total');
  incrementCounter(`errors:${source}`);

  if (existing && existing.count >= 5) {
    logger.error({ module: 'error-monitor', source, message: error.message, count: existing.count }, 'Recurring error threshold reached');
  }
}

/** Get top errors sorted by count */
export function getTopErrors(limit = 10): ErrorRecord[] {
  return [...errors.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Get error count by source */
export function getErrorCountBySource(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [, e] of errors) {
    result[e.source] = (result[e.source] ?? 0) + e.count;
  }
  return result;
}

/** Get total error count */
export function getTotalErrors(): number {
  return [...errors.values()].reduce((sum, e) => sum + e.count, 0);
}

/** Reset error records */
export function resetErrorMonitor(): void { errors.clear(); }
