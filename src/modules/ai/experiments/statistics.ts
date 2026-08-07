// ============================================
// Statistics Engine — pure mathematical functions
//
// Zero external dependencies. All functions are
// deterministic and fully typed.
// ============================================

// ── Central Tendency ──

/** Arithmetic mean */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Median (50th percentile) */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Mode (most frequent value) */
export function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let maxCount = 0;
  let modeVal: number | null = null;
  for (const [val, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeVal = val;
    }
  }
  return modeVal;
}

// ── Dispersion ──

/** Sample variance (unbiased estimator: divide by n-1) */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSqDiff = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return sumSqDiff / (values.length - 1);
}

/** Sample standard deviation */
export function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/** Range [min, max] */
export function range(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

// ── Percentiles ──

/** Compute the p-th percentile (0-100) */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (p <= 0) return Math.min(...values);
  if (p >= 100) return Math.max(...values);

  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Convenience: P50 (median) */
export function p50(values: number[]): number {
  return percentile(values, 50);
}

/** Convenience: P90 */
export function p90(values: number[]): number {
  return percentile(values, 90);
}

/** Convenience: P95 */
export function p95(values: number[]): number {
  return percentile(values, 95);
}

// ── Confidence Intervals ──

/**
 * Compute 95% confidence interval for the mean.
 * Uses t-distribution approximation for small samples,
 * z-distribution for large samples (n >= 30).
 */
export function confidenceInterval95(values: number[]): [number, number] {
  if (values.length < 2) return [values[0] ?? 0, values[0] ?? 0];

  const m = mean(values);
  const se = stdDev(values) / Math.sqrt(values.length);

  // t-value approximation for 95% CI
  const tValue = tCritical95(values.length - 1);

  return [m - tValue * se, m + tValue * se];
}

/**
 * Compute confidence interval at a given confidence level.
 * @param level 0-1 (e.g. 0.95 for 95%)
 */
export function confidenceInterval(
  values: number[],
  level: number = 0.95,
): [number, number] {
  if (values.length < 2) return [values[0] ?? 0, values[0] ?? 0];

  const m = mean(values);
  const se = stdDev(values) / Math.sqrt(values.length);
  const df = values.length - 1;

  // Use t-distribution
  const tValue = tCritical(level, df);

  return [m - tValue * se, m + tValue * se];
}

// ── Effect Size ──

/** Cohen's d effect size between two groups */
export function cohensD(groupA: number[], groupB: number[]): number {
  const meanA = mean(groupA);
  const meanB = mean(groupB);

  // Pooled standard deviation
  const nA = groupA.length;
  const nB = groupB.length;
  const varA = variance(groupA);
  const varB = variance(groupB);

  const pooledStd = Math.sqrt(
    ((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2),
  );

  if (pooledStd === 0) return 0;
  return (meanA - meanB) / pooledStd;
}

/** Interpret Cohen's d */
export function interpretCohensD(d: number): 'negligible' | 'small' | 'medium' | 'large' {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

// ── Welch's t-test (approximate) ──

/**
 * Welch's t-test for two independent samples.
 * Returns { tStatistic, pValue, significant }.
 * Uses a simplified approximation suitable for
 * experiment analysis.
 */
export function welchTTest(
  groupA: number[],
  groupB: number[],
): { tStatistic: number; pValue: number; significant: boolean } {
  const meanA = mean(groupA);
  const meanB = mean(groupB);
  const varA = variance(groupA);
  const varB = variance(groupB);
  const nA = groupA.length;
  const nB = groupB.length;

  if (nA < 2 || nB < 2) {
    return { tStatistic: 0, pValue: 1, significant: false };
  }

  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) {
    return { tStatistic: 0, pValue: 1, significant: false };
  }

  const tStatistic = (meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (varA / nA + varB / nB) ** 2;
  const denom = ((varA / nA) ** 2) / (nA - 1) + ((varB / nB) ** 2) / (nB - 1);
  const df = denom === 0 ? nA + nB - 2 : num / denom;

  const pValue = tDistPValue(Math.abs(tStatistic), df);

  return {
    tStatistic,
    pValue,
    significant: pValue < 0.05,
  };
}

// ── Stability Metrics ──

/**
 * Coefficient of Variation (CV) — normalized measure of dispersion.
 * Lower = more stable. CV < 0.1 is considered very stable.
 */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return stdDev(values) / Math.abs(m);
}

/**
 * Compute stability score (0-100).
 * Based on coefficient of variation. Lower CV = higher stability.
 */
export function stabilityScore(values: number[]): number {
  const cv = coefficientOfVariation(values);
  // Map CV to 0-100: CV=0 → 100, CV=1 → 0
  return Math.max(0, Math.min(100, 100 * (1 - Math.min(cv, 1))));
}

// ── Outlier Detection ──

/**
 * Detect outliers using IQR method.
 * Returns indices of outlier values.
 */
export function detectOutliers(values: number[]): number[] {
  if (values.length < 4) return [];
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  return values
    .map((v, i) => (v < lower || v > upper ? i : -1))
    .filter(i => i !== -1);
}

// ── Private Helpers ──

/** t-distribution critical values for 95% CI (two-tailed) */
const T_CRITICAL_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  40: 2.021, 50: 2.009, 60: 2.000, 80: 1.990, 100: 1.984,
  120: 1.980, Infinity: 1.960,
};

function tCritical95(df: number): number {
  if (df < 1) return T_CRITICAL_95[1];
  const key = Object.keys(T_CRITICAL_95)
    .map(Number)
    .filter(k => k >= df)
    .sort((a, b) => a - b)[0] ?? Infinity;
  return T_CRITICAL_95[key] ?? 1.96;
}

function tCritical(level: number, df: number): number {
  if (level === 0.95) return tCritical95(df);
  if (level === 0.99) {
    const t99: Record<number, number> = {
      1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032,
      10: 3.169, 20: 2.845, 30: 2.750, 60: 2.660, 120: 2.617, Infinity: 2.576,
    };
    const key = Object.keys(t99).map(Number).filter(k => k >= df).sort((a, b) => a - b)[0] ?? Infinity;
    return t99[key] ?? 2.576;
  }
  if (level === 0.90) {
    const t90: Record<number, number> = {
      1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015,
      10: 1.812, 20: 1.725, 30: 1.697, 60: 1.671, 120: 1.658, Infinity: 1.645,
    };
    const key = Object.keys(t90).map(Number).filter(k => k >= df).sort((a, b) => a - b)[0] ?? Infinity;
    return t90[key] ?? 1.645;
  }
  // Fallback to 95%
  return tCritical95(df);
}

/**
 * Approximate two-tailed p-value from t-distribution.
 * Uses a rational approximation (Abramowitz & Stegun 26.7.1).
 */
function tDistPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  if (!isFinite(t)) return 0;

  // For large df, approximate with normal distribution
  if (df > 100) {
    return normalPValue(t);
  }

  // Abramowitz & Stegun approximation
  const x = df / (df + t * t);
  const a = regularizedBeta(x, df / 2, 0.5);
  return a;
}

/** Normal distribution two-tailed p-value (approximation) */
function normalPValue(z: number): number {
  // Approximation of the standard normal CDF
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return (1 - y) * 2; // Two-tailed
}

/**
 * Regularized incomplete beta function (simplified).
 * Used for t-distribution p-value computation.
 */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use continued fraction for the incomplete beta
  const maxIterations = 200;
  const epsilon = 1e-15;

  // Compute the beta function value
  const betaAB = Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));

  // Continued fraction
  const front = (Math.exp(a * Math.log(x) + b * Math.log(1 - x)) / a) * (1 / betaAB);

  let f = 1.0;
  let c = 1.0;
  let d = 1.0 - (a + b) * x / (a + 1);
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;

    // Even step
    let num = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1.0 + num * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1.0 + num / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1.0 / d;
    h *= d * c;

    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1.0 + num * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1.0 + num / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1.0 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1.0) < epsilon) break;
  }

  return front * (h - 1.0);
}

/** Log-gamma function (Stirling approximation) */
function logGamma(x: number): number {
  if (x <= 0) return Infinity;
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
