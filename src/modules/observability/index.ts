// Sprint 17: Observability — barrel
export {
  incrementCounter, getCounter, recordHistogram, getHistogram,
  setGauge, getGauge, timeAsync, timeSync, getAllMetrics, resetMetrics,
  type MetricSnapshot,
} from './metrics';
export {
  startTrace, startSpan, endSpan, traceAsync,
  getCompletedSpans, getActiveSpans, resetTracer,
  type Span,
} from './tracer';
export {
  recordAiLatency, recordDbLatency, getAiLatencySummary,
  getLatencyRecords, resetLatencyMonitor,
  type LatencyRecord,
} from './latency-monitor';
export {
  recordError, getTopErrors, getErrorCountBySource, getTotalErrors,
  resetErrorMonitor, type ErrorRecord,
} from './error-monitor';
export {
  generateHealthReport, formatHealthReport,
  type HealthReport,
} from './health-report';
