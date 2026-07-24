// Sprint 98: Reliability Score — computes overall platform reliability 0-100
import type { ReliabilityScore, ReliabilityComponent, ReliabilityGrade } from './slo-types';
import { evaluateAll } from './slo-manager';
import { detectSaturation } from '@/modules/ai/runtime/saturation-detector';
import { detectRegressions } from '@/modules/ai/runtime/regression-detector';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { getCapacityPlan } from '@/modules/ai/runtime/capacity-planner';

export function computeReliabilityScore(): ReliabilityScore {
  const components: ReliabilityComponent[] = [];
  const m = getRuntimeMetrics();
  const saturation = detectSaturation();
  const regression = detectRegressions();
  const capacity = getCapacityPlan();
  const sloReport = evaluateAll();

  // 1. SLO compliance (weight: 30)
  const sloCompliant = sloReport.evaluations.filter(e => e.status === 'compliant').length;
  const sloScore = sloReport.evaluations.length > 0 ? (sloCompliant / sloReport.evaluations.length) * 100 : 100;
  components.push({ name: 'SLO Compliance', score: Math.round(sloScore), weight: 30, status: sloScore >= 90 ? 'healthy' : sloScore >= 70 ? 'degraded' : 'unhealthy', details: `${sloCompliant}/${sloReport.evaluations.length} SLOs compliant` });

  // 2. Provider health (weight: 25)
  const providerSuccess = m.providers && (m.providers as Record<string, unknown>[]).length > 0 ? (m.providers as Record<string, unknown>[]).reduce((s: number, p: Record<string, unknown>) => s + (Number(p.successRate) || 0), 0) / (m.providers as Record<string, unknown>[]).length : 100;
  components.push({ name: 'Provider Health', score: Math.round(providerSuccess), weight: 25, status: providerSuccess >= 95 ? 'healthy' : providerSuccess >= 80 ? 'degraded' : 'unhealthy', details: `Avg success rate: ${Math.round(providerSuccess)}%` });

  // 3. Saturation (weight: 15)
  const saturationScore = saturation.overall === 'healthy' ? 100 : saturation.overall === 'warning' ? 65 : 30;
  const satStatus: 'healthy' | 'degraded' | 'unhealthy' = saturation.overall === 'healthy' ? 'healthy' : saturation.overall === 'warning' ? 'degraded' : 'unhealthy';
  components.push({ name: 'System Saturation', score: saturationScore, weight: 15, status: satStatus, details: saturation.summary });

  // 4. Regression (weight: 15)
  const regScore = regression.hasRegressions ? 40 : 100;
  components.push({ name: 'Regression Status', score: regScore, weight: 15, status: regression.hasRegressions ? 'degraded' : 'healthy', details: regression.summary });

  // 5. Capacity (weight: 10)
  const maxSaturation = Math.max(...Object.values(capacity.providerThroughput).map(p => p.saturationPercent), 0);
  const capScore = maxSaturation > 80 ? 30 : maxSaturation > 50 ? 60 : 100;
  components.push({ name: 'Capacity Headroom', score: capScore, weight: 10, status: capScore >= 80 ? 'healthy' : capScore >= 50 ? 'degraded' : 'unhealthy', details: `Max provider saturation: ${maxSaturation}%` });

  // 6. Cache efficiency (weight: 5)
  const cacheScore = Math.round((m.cacheHitRatio || 0) * 100);
  components.push({ name: 'Cache Efficiency', score: cacheScore, weight: 5, status: cacheScore >= 50 ? 'healthy' : cacheScore >= 20 ? 'degraded' : 'unhealthy', details: `Cache hit ratio: ${Math.round((m.cacheHitRatio || 0) * 100)}%` });

  const totalScore = Math.round(components.reduce((sum, c) => sum + c.score * (c.weight / 100), 0));
  const grade = gradeFromScore(totalScore);

  return { score: totalScore, grade, components, timestamp: new Date().toISOString() };
}

function gradeFromScore(score: number): ReliabilityGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}
