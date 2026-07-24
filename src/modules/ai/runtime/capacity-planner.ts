// Sprint 97: AI Capacity Planner — estimates throughput, queue depth, cost under load
import { getRuntimeMetrics } from '../services/runtime-metrics';

export interface CapacityPlan {
  timestamp: string;
  maxConcurrentRequests: number;
  providerThroughput: Record<string, ProviderCapacity>;
  estimatedQueueDepth: number;
  retryAmplification: number;
  fallbackAmplification: number;
  costEstimate: CostEstimate;
  recommendations: string[];
}

export interface ProviderCapacity {
  provider: string;
  callsPerMinute: number;
  avgLatencyMs: number;
  successRate: number;
  estimatedMaxConcurrent: number;
  saturationPercent: number;
}

export interface CostEstimate {
  estimatedDailyCost: number;
  estimatedMonthlyCost: number;
  currency: string;
  assumptions: string[];
}

export function getCapacityPlan(): CapacityPlan {
  const m = getRuntimeMetrics();
  const totalCalls = m.totalCalls || 1;

  // Provider capacity based on current latency and success rates
  const providerCapacity: Record<string, ProviderCapacity> = {};
  for (const p of m.providers || []) {
    const prov = p as Record<string, unknown>;
    const name = String(prov.provider || 'unknown');
    const avgMs = Number(prov.avgLatencyMs) || 1000;
    // Estimate max concurrent: assume each call takes avgMs, target 80% utilization
    const estimatedMax = Math.floor((1000 / Math.max(1, avgMs)) * 0.8 * 60);
    providerCapacity[name] = {
      provider: name,
      callsPerMinute: Number(prov.calls) || 0,
      avgLatencyMs: avgMs,
      successRate: Number(prov.successRate) || 0,
      estimatedMaxConcurrent: Math.max(1, estimatedMax),
      saturationPercent: estimatedMax > 0 ? Math.round(((Number(prov.calls) || 0) / estimatedMax) * 100) : 0,
    };
  }

  // Retry amplification: retries / total calls
  const retryAmplification = totalCalls > 0 ? (m.totalRetries || 0) / totalCalls : 0;
  const fallbackAmplification = totalCalls > 0
    ? ((m.providers || []).reduce((sum: number, p: Record<string, unknown>) => sum + (Number(p.fallbackCount) || 0), 0)) / totalCalls
    : 0;

  // Queue depth estimate (Little's Law: L = λ × W)
  const arrivalRate = totalCalls / 3600; // requests per second (assume 1-hour window)
  const avgServiceTime = (m.avgLatencyMs || 1000) / 1000;
  const estimatedQueueDepth = Math.round(arrivalRate * avgServiceTime * 100) / 100;

  // Rough cost estimate
  const costPerCall = 0.002; // ~$0.002 per AI call (average across providers)
  const estimatedDailyCost = Math.round(totalCalls * costPerCall * 100) / 100;
  const estimatedMonthlyCost = Math.round(estimatedDailyCost * 30 * 100) / 100;

  const recommendations: string[] = [];
  const maxSaturation = Math.max(...Object.values(providerCapacity).map(p => p.saturationPercent), 0);
  if (maxSaturation > 80) recommendations.push('CRITICAL: Provider saturation > 80%. Consider adding fallback providers or rate limiting.');
  else if (maxSaturation > 50) recommendations.push('WARNING: Provider saturation > 50%. Monitor closely during peak hours.');
  if (retryAmplification > 0.1) recommendations.push(`WARNING: Retry rate at ${(retryAmplification * 100).toFixed(0)}%. Investigate root causes.`);
  if (fallbackAmplification > 0.05) recommendations.push(`WARNING: Fallback rate at ${(fallbackAmplification * 100).toFixed(0)}%. Primary providers may be unstable.`);
  if (recommendations.length === 0) recommendations.push('Capacity is healthy. No concerns.');

  return {
    timestamp: new Date().toISOString(),
    maxConcurrentRequests: Math.min(...Object.values(providerCapacity).map(p => p.estimatedMaxConcurrent), 100),
    providerThroughput: providerCapacity,
    estimatedQueueDepth,
    retryAmplification: Math.round(retryAmplification * 100) / 100,
    fallbackAmplification: Math.round(fallbackAmplification * 100) / 100,
    costEstimate: {
      estimatedDailyCost,
      estimatedMonthlyCost,
      currency: 'USD',
      assumptions: ['Average cost $0.002 per AI call', '30-day month', 'Based on current runtime metrics snapshot'],
    },
    recommendations,
  };
}
