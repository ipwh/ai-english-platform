// Sprint 98: Incident Classifier — auto-classifies runtime issues
import type { Incident, IncidentCategory, IncidentReport, IncidentSeverity } from './slo-types';
import { detectSaturation } from '@/modules/ai/runtime/saturation-detector';
import { detectRegressions } from '@/modules/ai/runtime/regression-detector';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { getCapacityPlan } from '@/modules/ai/runtime/capacity-planner';

const recentIncidents: Incident[] = [];
let counter = 0;

export function classifyIncidents(): IncidentReport {
  const incidents: Incident[] = [];
  const m = getRuntimeMetrics();
  const saturation = detectSaturation();
  const regression = detectRegressions();
  const capacity = getCapacityPlan();

  // Provider failures
  for (const [name, cap] of Object.entries(capacity.providerThroughput)) {
    if (cap.successRate < 90) {
      incidents.push(makeIncident('ProviderFailure', cap.successRate < 70 ? 'Critical' : 'High', `provider:${name}`, `Provider ${name} success rate at ${cap.successRate}%`, { successRate: cap.successRate }));
    }
  }

  // High latency
  if (m.avgLatencyMs > 5000) {
    incidents.push(makeIncident('HighLatency', 'High', 'runtime-metrics', `Average latency at ${m.avgLatencyMs}ms`, { avgLatencyMs: m.avgLatencyMs }));
  }

  // Retry storm
  const retryRate = m.totalCalls > 0 ? (m.totalRetries || 0) / m.totalCalls : 0;
  if (retryRate > 0.1) {
    incidents.push(makeIncident('RetryStorm', retryRate > 0.2 ? 'Critical' : 'High', 'runtime-metrics', `Retry rate at ${Math.round(retryRate * 100)}%`, { retryRate: Math.round(retryRate * 100) }));
  }

  // Fallback cascade
  const fallbackRate = capacity.fallbackAmplification;
  if (fallbackRate > 0.08) {
    incidents.push(makeIncident('FallbackCascade', fallbackRate > 0.15 ? 'Critical' : 'High', 'capacity-planner', `Fallback rate at ${Math.round(fallbackRate * 100)}%`, { fallbackRate: Math.round(fallbackRate * 100) }));
  }

  // Circuit breaker
  if (fallbackRate > 0.15) {
    incidents.push(makeIncident('CircuitBreakerOpen', 'Critical', 'circuit-breaker', `Circuit breaker cascade risk at ${Math.round(fallbackRate * 100)}%`, { fallbackRate: Math.round(fallbackRate * 100) }));
  }

  // Validation failures
  const valRate = m.totalCalls > 0 ? (m.validationFailures || 0) / m.totalCalls : 0;
  if (valRate > 0.05) {
    incidents.push(makeIncident('ValidationFailure', valRate > 0.1 ? 'High' : 'Medium', 'runtime-metrics', `Validation failure rate at ${Math.round(valRate * 100)}%`, { validationRate: Math.round(valRate * 100) }));
  }

  // Memory pressure
  try {
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (memMB > 400) {
      incidents.push(makeIncident('MemoryPressure', memMB > 600 ? 'Critical' : 'High', 'process', `Heap at ${memMB}MB`, { heapMB: memMB }));
    }
  } catch { /* memoryUsage not available */ }

  recentIncidents.push(...incidents);
  if (recentIncidents.length > 100) recentIncidents.splice(0, recentIncidents.length - 100);

  const byCategory = {} as Record<IncidentCategory, number>;
  const bySeverity = {} as Record<IncidentSeverity, number>;
  for (const i of incidents) {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
  }

  return { timestamp: new Date().toISOString(), active: incidents, recentCount: recentIncidents.length, byCategory, bySeverity };
}

function makeIncident(category: IncidentCategory, severity: IncidentSeverity, source: string, summary: string, metrics: Record<string, number>): Incident {
  return { id: `INC-${++counter}-${Date.now()}`, category, severity, detectedAt: new Date().toISOString(), source, summary, metrics, runbookRef: `runbook:${category}` };
}
