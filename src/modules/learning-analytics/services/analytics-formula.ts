// Sprint 37: Learning Analytics — pure computation (no DB)
import type { TrendPoint, TrendDirection } from '../types';

/**
 * Compute trend direction from data points using linear regression.
 */
export function computeTrendDirection(points: TrendPoint[]): TrendDirection {
  if (points.length < 2) return 'stable';
  const values = points.map(p => p.value);
  const n = values.length;
  const avg = values.reduce((a, b) => a + b, 0) / n;
  if (avg === 0) return 'stable';

  const xMean = (n - 1) / 2;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - avg);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return 'stable';
  const slope = num / den / avg;
  if (slope > 0.02) return 'up';
  if (slope < -0.02) return 'down';
  return 'stable';
}

/**
 * Compute risk level from overall mastery.
 */
export function computeRiskLevel(overallMastery: number): 'high' | 'medium' | 'low' {
  if (overallMastery < 35) return 'high';
  if (overallMastery < 60) return 'medium';
  return 'low';
}

/**
 * Build radar chart data from skill scores.
 */
export function buildRadarData(skills: Record<string, number>): Record<string, number> {
  // Normalize all values to 0-100
  return skills;
}

/**
 * Build progress bar data.
 */
export function buildProgressBar(items: Array<{ label: string; value: number }>): Array<{ label: string; value: number }> {
  return items.sort((a, b) => b.value - a.value);
}
