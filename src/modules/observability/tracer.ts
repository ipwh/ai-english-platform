// Sprint 17: Tracer — request tracing with span IDs
import { logger } from '@/shared/logger/logger';
import { recordHistogram, incrementCounter } from './metrics';

export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  metadata?: Record<string, unknown>;
}

const activeSpans = new Map<string, Span>();
const completedSpans: Span[] = [];
let traceCounter = 0;
let spanCounter = 0;

function generateId(): string {
  return `${Date.now().toString(36)}-${(++spanCounter).toString(36)}`;
}

/** Start a new trace (top-level) */
export function startTrace(name: string, metadata?: Record<string, unknown>): string {
  const traceId = `trace-${++traceCounter}-${Date.now().toString(36)}`;
  const span: Span = { id: generateId(), traceId, name, startTime: performance.now(), status: 'ok', metadata };
  activeSpans.set(span.id, span);
  logger.debug({ module: 'tracer', traceId, name }, 'Trace started');
  return traceId;
}

/** Start a child span within a trace */
export function startSpan(traceId: string, name: string, parentId?: string): string {
  const span: Span = { id: generateId(), traceId, parentId, name, startTime: performance.now(), status: 'ok' };
  activeSpans.set(span.id, span);
  return span.id;
}

/** End a span */
export function endSpan(spanId: string, error?: Error): void {
  const span = activeSpans.get(spanId);
  if (!span) return;
  span.endTime = performance.now();
  span.status = error ? 'error' : 'ok';
  if (error) span.metadata = { ...span.metadata, error: error.message };

  activeSpans.delete(spanId);
  completedSpans.push(span);

  const duration = span.endTime - span.startTime;
  recordHistogram(`trace:${span.name}`, duration);
  incrementCounter(`trace:${span.name}:count`);
  if (error) incrementCounter(`trace:${span.name}:errors`);

  if (completedSpans.length > 1000) completedSpans.splice(0, 500);
}

/** Trace an async function — automatically creates span */
export async function traceAsync<T>(name: string, fn: (spanId: string) => Promise<T>): Promise<T> {
  const traceId = startTrace(name);
  const spanId = startSpan(traceId, name);
  try {
    return await fn(spanId);
  } catch (e) {
    endSpan(spanId, e as Error);
    throw e;
  }
  // Note: callers should endSpan when done, or span stays active
}

/** Get all completed spans */
export function getCompletedSpans(): Span[] { return [...completedSpans]; }

/** Get active spans */
export function getActiveSpans(): Span[] { return [...activeSpans.values()]; }

/** Reset tracer state */
export function resetTracer(): void {
  activeSpans.clear();
  completedSpans.length = 0;
  traceCounter = 0;
  spanCounter = 0;
}
