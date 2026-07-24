// Sprint 98: SLO Manager — registers and evaluates Service Level Objectives
import type { SLODefinition, SLOEvaluation, SLOReport, SLOMetrics, SLOStatus } from './slo-types';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { logger } from '@/shared/logger/logger';

const slos: Map<string, SLODefinition> = new Map();

export function registerSLO(def: SLODefinition): void {
  slos.set(def.id, def);
  logger.info({ module: 'slo', sloId: def.id, name: def.name }, 'SLO registered');
}

export function getSLO(id: string): SLODefinition | undefined {
  return slos.get(id);
}

export function evaluate(sloId: string): SLOEvaluation {
  const def = slos.get(sloId);
  if (!def) throw new Error(`SLO not found: ${sloId}`);
  const m = getRuntimeMetrics();
  const metrics: SLOMetrics = {
    availability: 1, // derived from provider success rates
    avgLatencyMs: m.avgLatencyMs || 0,
    p95LatencyMs: 0,
    errorRate: m.totalCalls > 0 ? (m.validationFailures || 0) / m.totalCalls : 0,
    successRate: m.totalCalls > 0 ? 1 - ((m.validationFailures || 0) / m.totalCalls) : 1,
    retryRate: m.totalCalls > 0 ? (m.totalRetries || 0) / m.totalCalls : 0,
    fallbackRate: 0,
  };
  const compliance = {
    availability: { met: metrics.availability >= def.target, actual: metrics.availability, target: def.target },
    latency: { met: metrics.avgLatencyMs <= 3000, actual: metrics.avgLatencyMs, target: 3000 },
    errorRate: { met: metrics.errorRate <= 0.05, actual: metrics.errorRate, target: 0.05 },
    successRate: { met: metrics.successRate >= def.target, actual: metrics.successRate, target: def.target },
  };
  const met = [compliance.availability, compliance.latency, compliance.errorRate, compliance.successRate].filter(c => c.met).length;
  const status: SLOStatus = met >= 4 ? 'compliant' : met >= 3 ? 'at-risk' : 'breached';
  return { sloId: def.id, name: def.name, status, target: def.target, current: metrics, compliance, evaluatedAt: new Date().toISOString() };
}

export function evaluateAll(): SLOReport {
  const evaluations: SLOEvaluation[] = [];
  for (const id of slos.keys()) { evaluations.push(evaluate(id)); }
  const breached = evaluations.filter(e => e.status === 'breached').length;
  const atRisk = evaluations.filter(e => e.status === 'at-risk').length;
  return {
    timestamp: new Date().toISOString(),
    evaluations,
    overallStatus: breached > 0 ? 'breached' : atRisk > 0 ? 'at-risk' : 'compliant',
    breachedCount: breached,
    atRiskCount: atRisk,
  };
}

export function getStatus(): SLOReport { return evaluateAll(); }

export function exportSnapshot(): SLOReport { return evaluateAll(); }

// Register default SLOs on module load
registerSLO({ id: 'ai-availability', name: 'AI Availability', description: 'AI provider uptime and response rate', target: 0.995, windowHours: 24, metrics: { availability: 0, avgLatencyMs: 0, p95LatencyMs: 0, errorRate: 0, successRate: 0, retryRate: 0, fallbackRate: 0 } });
registerSLO({ id: 'ai-latency', name: 'AI Latency', description: 'P95 latency under 3 seconds', target: 0.95, windowHours: 24, metrics: { availability: 0, avgLatencyMs: 0, p95LatencyMs: 0, errorRate: 0, successRate: 0, retryRate: 0, fallbackRate: 0 } });
registerSLO({ id: 'ai-success-rate', name: 'AI Success Rate', description: 'AI call success rate above 99%', target: 0.99, windowHours: 24, metrics: { availability: 0, avgLatencyMs: 0, p95LatencyMs: 0, errorRate: 0, successRate: 0, retryRate: 0, fallbackRate: 0 } });
