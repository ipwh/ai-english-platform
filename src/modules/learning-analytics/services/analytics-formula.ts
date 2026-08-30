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


