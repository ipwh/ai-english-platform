// Sprint 97: Runtime Saturation Detector — detects provider overload, retry storms, memory pressure
import { getCapacityPlan } from './capacity-planner';

export type SaturationSeverity = 'healthy' | 'warning' | 'critical';

export interface SaturationCheck {
  name: string;
  severity: SaturationSeverity;
  current: number;
  threshold: number;
  message: string;
}

export interface SaturationReport {
  timestamp: string;
  overall: SaturationSeverity;
  checks: SaturationCheck[];
  summary: string;
}

export function detectSaturation(): SaturationReport {
  const capacity = getCapacityPlan();
  const checks: SaturationCheck[] = [];

  // Provider saturation
  for (const [name, cap] of Object.entries(capacity.providerThroughput)) {
    const sev: SaturationSeverity = cap.saturationPercent > 80 ? 'critical' : cap.saturationPercent > 50 ? 'warning' : 'healthy';
    checks.push({
      name: `provider_saturation_${name}`,
      severity: sev,
      current: cap.saturationPercent,
      threshold: 80,
      message: sev === 'critical' ? `CRITICAL: ${name} at ${cap.saturationPercent}% saturation` : sev === 'warning' ? `WARNING: ${name} at ${cap.saturationPercent}% saturation` : `${name}: healthy`,
    });
  }

  // Retry storm detection
  const retryRate = capacity.retryAmplification;
  const retrySev: SaturationSeverity = retryRate > 0.15 ? 'critical' : retryRate > 0.08 ? 'warning' : 'healthy';
  checks.push({
    name: 'retry_storm',
    severity: retrySev,
    current: Math.round(retryRate * 100),
    threshold: 15,
    message: retrySev === 'critical' ? `CRITICAL: Retry rate at ${Math.round(retryRate * 100)}%` : retrySev === 'warning' ? `WARNING: Retry rate at ${Math.round(retryRate * 100)}%` : 'Retry rate: healthy',
  });

  // Fallback cascade detection
  const fallbackRate = capacity.fallbackAmplification;
  const fallbackSev: SaturationSeverity = fallbackRate > 0.1 ? 'critical' : fallbackRate > 0.05 ? 'warning' : 'healthy';
  checks.push({
    name: 'fallback_cascade',
    severity: fallbackSev,
    current: Math.round(fallbackRate * 100),
    threshold: 10,
    message: fallbackSev === 'critical' ? `CRITICAL: Fallback rate at ${Math.round(fallbackRate * 100)}%` : fallbackSev === 'warning' ? `WARNING: Fallback rate at ${Math.round(fallbackRate * 100)}%` : 'Fallback rate: healthy',
  });

  // Circuit breaker check
  const cbSev: SaturationSeverity = fallbackRate > 0.2 ? 'critical' : 'healthy';
  checks.push({
    name: 'circuit_breaker_cascade',
    severity: cbSev,
    current: Math.round(fallbackRate * 100),
    threshold: 20,
    message: cbSev === 'critical' ? 'CRITICAL: Potential circuit breaker cascade' : 'Circuit breakers: healthy',
  });

  // Memory pressure
  const memMB = process.memoryUsage?.()?.heapUsed ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
  const memSev: SaturationSeverity = memMB > 500 ? 'critical' : memMB > 300 ? 'warning' : 'healthy';
  checks.push({
    name: 'memory_pressure',
    severity: memSev,
    current: memMB,
    threshold: 500,
    message: memSev === 'critical' ? `CRITICAL: Heap at ${memMB}MB` : memSev === 'warning' ? `WARNING: Heap at ${memMB}MB` : `Memory: ${memMB}MB (healthy)`,
  });

  const hasCritical = checks.some(c => c.severity === 'critical');
  const hasWarning = checks.some(c => c.severity === 'warning');
  const overall: SaturationSeverity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    overall,
    checks,
    summary: overall === 'healthy' ? 'System is healthy. No saturation detected.' : `${checks.filter(c => c.severity === 'critical').length} critical, ${checks.filter(c => c.severity === 'warning').length} warning(s) detected.`,
  };
}
