// Sprint 32: Pure calculation functions — no DB dependencies (testable without Prisma)
import type { TrendDirection, TrendInput } from '../types';

// ============================================
// Trend Calculation Constants
// ============================================
const IMPROVEMENT_THRESHOLD = 0.15; // 15% decrease = improving
const WORSENING_THRESHOLD = 0.15;   // 15% increase = worsening

/**
 * Calculate improvement/worsening trend from weekly mistake counts.
 * Uses linear regression slope to determine direction.
 *
 * - Positive slope = worsening (more mistakes over time)
 * - Negative slope = improving (fewer mistakes over time)
 * - Near-zero slope = stable
 */
export function calculateTrend(input: TrendInput): TrendDirection {
  const { weeklyCounts } = input;

  if (weeklyCounts.length < 2) return 'stable';

  const n = weeklyCounts.length;
  const avgCount = weeklyCounts.reduce((a, b) => a + b, 0) / n;
  if (avgCount === 0) return 'stable';

  // Simple linear regression: slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
  const xMean = (n - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const dy = weeklyCounts[i] - avgCount;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  if (denominator === 0) return 'stable';

  const slope = numerator / denominator;
  const normalizedSlope = slope / avgCount;

  if (normalizedSlope <= -IMPROVEMENT_THRESHOLD) return 'improving';
  if (normalizedSlope >= WORSENING_THRESHOLD) return 'worsening';
  return 'stable';
}

/**
 * Calculate a severity score (0-100) for a weakness category.
 * Higher = more severe (more mistakes, more recent).
 */
export function calculateWeaknessSeverityScore(params: {
  mistakeCount: number;
  daysSinceLastSeen: number;
  totalMistakes: number;
}): number {
  const { mistakeCount, daysSinceLastSeen, totalMistakes } = params;

  if (totalMistakes === 0) return 0;

  // Frequency component: how large a share of total mistakes
  const frequencyScore = Math.min(1, mistakeCount / Math.max(totalMistakes, 1)) * 50;

  // Recency component: more recent = higher severity (capped at 30 days)
  const recencyScore = Math.max(0, 1 - daysSinceLastSeen / 30) * 50;

  return Math.round(frequencyScore + recencyScore);
}

/**
 * Determine if a weakness is "persistent" — recurring over many weeks.
 */
export function isPersistentWeakness(params: {
  mistakeCount: number;
  trend: TrendDirection;
  severity: string;
}): boolean {
  const { mistakeCount, trend, severity } = params;
  if (severity === 'critical') return mistakeCount >= 2;
  if (trend === 'worsening') return mistakeCount >= 3;
  return mistakeCount >= 5;
}
