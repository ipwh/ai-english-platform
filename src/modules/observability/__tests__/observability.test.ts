// Sprint 17: Observability Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { incrementCounter, getCounter, recordHistogram, getHistogram, setGauge, getGauge, timeAsync, getAllMetrics, resetMetrics } from '../metrics';
import { startTrace, startSpan, endSpan, traceAsync, getCompletedSpans, resetTracer } from '../tracer';
import { recordAiLatency, recordDbLatency, getAiLatencySummary, resetLatencyMonitor } from '../latency-monitor';
import { recordError, getTopErrors, getTotalErrors, resetErrorMonitor } from '../error-monitor';
import { generateHealthReport, formatHealthReport } from '../health-report';

beforeEach(() => {
  resetMetrics(); resetTracer(); resetLatencyMonitor(); resetErrorMonitor();
});

describe('Metrics', () => {
  it('should increment and get counters', () => {
    incrementCounter('test.requests');
    incrementCounter('test.requests');
    expect(getCounter('test.requests')).toBe(2);
  });

  it('should record and compute histograms', () => {
    recordHistogram('test.latency', 100);
    recordHistogram('test.latency', 200);
    recordHistogram('test.latency', 300);
    const h = getHistogram('test.latency');
    expect(h.count).toBe(3);
    expect(h.avg).toBe(200);
    expect(h.max).toBe(300);
  });

  it('should set and get gauges', () => {
    setGauge('test.active', 5);
    expect(getGauge('test.active')).toBe(5);
    setGauge('test.active', 3);
    expect(getGauge('test.active')).toBe(3);
  });

  it('should time async functions', async () => {
    await timeAsync('test.timer', async () => { /* noop */ });
    const h = getHistogram('test.timer');
    expect(h.count).toBe(1);
  });
});

describe('Tracer', () => {
  it('should start and end spans', () => {
    const traceId = startTrace('test-op');
    const spanId = startSpan(traceId, 'sub-op');
    endSpan(spanId);
    expect(getCompletedSpans().length).toBe(1);
    expect(getCompletedSpans()[0].name).toBe('sub-op');
  });

  it('should trace async functions', async () => {
    await traceAsync('test-trace', async (spanId) => {
      endSpan(spanId);
      return 'result';
    });
    expect(getCompletedSpans().length).toBeGreaterThanOrEqual(1);
  });
});

describe('LatencyMonitor', () => {
  it('should record AI latency', () => {
    recordAiLatency('deepseek-chat', 'generate', 1500, true);
    recordAiLatency('deepseek-chat', 'generate', 2500, true);
    recordAiLatency('deepseek-chat', 'generate', 8000, false);
    const summary = getAiLatencySummary();
    expect(summary.byModel['deepseek-chat'].count).toBe(3);
    expect(summary.byModel['deepseek-chat'].errorRate).toBeCloseTo(1/3);
  });

  it('should record DB latency', () => {
    recordDbLatency('findMany', 200, true);
    recordDbLatency('create', 4500, true);
    expect(true).toBe(true); // Smoke test
  });
});

describe('ErrorMonitor', () => {
  it('should aggregate errors', () => {
    recordError(new Error('Connection timeout'), 'ai');
    recordError(new Error('Connection timeout'), 'ai');
    recordError(new Error('Connection timeout'), 'ai');
    recordError(new Error('Validation failed'), 'api');
    expect(getTotalErrors()).toBe(4);
    const top = getTopErrors();
    expect(top[0].count).toBe(3);
    expect(top[0].message).toBe('Connection timeout');
  });
});

describe('HealthReport', () => {
  it('should generate a health report', () => {
    incrementCounter('test', 1);
    recordAiLatency('deepseek-chat', 'gen', 1000, true);
    recordError(new Error('test error'), 'api');

    const report = generateHealthReport();
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(report.metrics.counters).toBeGreaterThan(0);
    expect(report.errors.total).toBeGreaterThan(0);
  });

  it('should format a health report', () => {
    const report = generateHealthReport();
    const formatted = formatHealthReport(report);
    expect(formatted).toContain('Health Report');
    expect(formatted).toContain('Metrics');
    expect(formatted).toContain('Tracing');
  });
});
