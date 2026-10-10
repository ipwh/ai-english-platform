// ============================================
// Quality Trend — rolling history analysis
// with moving averages, slopes, and trend
// direction detection.
//
// Supports 7-day, 30-day, and 90-day windows.
// ============================================

import type { TrendDirection, TrendWindows } from './config';
import type { ScoreRecord } from './score-history';
import { scoreHistory } from './score-history';

// ── Types ──

/** Trend analysis for a single time window */
export interface WindowTrend {
  /** Window size in days */
  windowDays: number;
  /** Number of records in this window */
  recordCount: number;
  /** Moving average of overall scores */
  movingAverage: number;
  /** Trend direction */
  direction: TrendDirection;
  /** Slope (score change per day) */
  slope: number;
  /** Best score in window */
  bestScore: number;
  /** Best score timestamp */
  bestScoreDate: string;
  /** Worst score in window */
  worstScore: number;
  /** Worst score timestamp */
  worstScoreDate: string;
  /** Score at start of window */
  startScore: number;
  /** Score at end of window */
  endScore: number;
  /** Standard deviation */
  stdDev: number;
}

/** Complete quality trend for a prompt */
export interface QualityTrend {
  promptName: string;
  /** Short-term trend (7-day) */
  shortTerm: WindowTrend;
  /** Medium-term trend (30-day) */
  mediumTerm: WindowTrend;
  /** Long-term trend (90-day) */
  longTerm: WindowTrend;
  /** Overall assessment */
  overallDirection: TrendDirection;
  /** Whether quality is currently at its best */
  isAtPeak: boolean;
  /** Whether quality is currently at its worst */
  isAtTrough: boolean;
  /** Timestamp */
  timestamp: string;
}

// ── Public API ──

/**
 * Compute quality trend for a prompt across all time windows.
 */
export function computeQualityTrend(
  promptName: string,
  windows: TrendWindows,
): QualityTrend {
  const now = new Date();
  const shortTerm = computeWindowTrend(promptName, windows.shortTerm, now);
  const mediumTerm = computeWindowTrend(promptName, windows.mediumTerm, now);
  const longTerm = computeWindowTrend(promptName, windows.longTerm, now);

  // Overall direction: weighted by recency
  const directions = [shortTerm.direction, mediumTerm.direction, longTerm.direction];
  const decliningCount = directions.filter(d => d === 'declining').length;
  const improvingCount = directions.filter(d => d === 'improving').length;

  let overallDirection: TrendDirection;
  if (decliningCount >= 2) overallDirection = 'declining';
  else if (improvingCount >= 2) overallDirection = 'improving';
  else if (shortTerm.direction === 'volatile' || mediumTerm.direction === 'volatile') overallDirection = 'volatile';
  else overallDirection = 'stable';

  // Peak / trough detection
  const isAtPeak = shortTerm.endScore >= longTerm.bestScore * 0.98;
  const isAtTrough = shortTerm.endScore <= longTerm.worstScore * 1.02;

  return {
    promptName,
    shortTerm,
    mediumTerm,
    longTerm,
    overallDirection,
    isAtPeak,
    isAtTrough,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compute trend for a single time window.
 */
function computeWindowTrend(
  promptName: string,
  windowDays: number,
  now: Date,
): WindowTrend {
  const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const records = scoreHistory.getByWindow(promptName, startDate, now)
    .filter(r => r.success)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)); // oldest first

  if (records.length === 0) {
    return {
      windowDays,
      recordCount: 0,
      movingAverage: 0,
      direction: 'stable',
      slope: 0,
      bestScore: 0,
      bestScoreDate: '',
      worstScore: 0,
      worstScoreDate: '',
      startScore: 0,
      endScore: 0,
      stdDev: 0,
    };
  }

  const scores = records.map(r => r.overallScore);

  // Moving average (simple, last N)
  const movingAvg = scores.length > 0
    ? scores.reduce((s, v) => s + v, 0) / scores.length
    : 0;

  // Linear regression slope
  const slope = computeSlope(records);

  // Best / worst
  let bestScore = scores[0];
  let bestIdx = 0;
  let worstScore = scores[0];
  let worstIdx = 0;

  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > bestScore) { bestScore = scores[i]; bestIdx = i; }
    if (scores[i] < worstScore) { worstScore = scores[i]; worstIdx = i; }
  }

  // Direction
  const direction = classifyDirection(slope, scores);

  // StdDev
  const mean = movingAvg;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return {
    windowDays,
    recordCount: records.length,
    movingAverage: Math.round(movingAvg * 10) / 10,
    direction,
    slope: Math.round(slope * 1000) / 1000,
    bestScore,
    bestScoreDate: records[bestIdx]?.timestamp ?? '',
    worstScore,
    worstScoreDate: records[worstIdx]?.timestamp ?? '',
    startScore: scores[0],
    endScore: scores[scores.length - 1],
    stdDev: Math.round(stdDev * 100) / 100,
  };
}

// ── Linear Regression ──

/**
 * Compute the slope of the linear regression line.
 * Positive = improving, negative = declining.
 */
function computeSlope(records: ScoreRecord[]): number {
  if (records.length < 2) return 0;

  // Convert timestamps to days from first record
  const base = new Date(records[0].timestamp).getTime();
  const points = records.map(r => ({
    x: (new Date(r.timestamp).getTime() - base) / (24 * 60 * 60 * 1000),
    y: r.overallScore,
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

// ── Direction Classification ──

function classifyDirection(slope: number, scores: number[]): TrendDirection {
  // Check for volatility first (high variance relative to slope)
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;

  // If coefficient of variation > 0.05, consider it volatile
  if (cv > 0.05 && Math.abs(slope) < 0.5) return 'volatile';

  // Small slope = stable
  if (Math.abs(slope) < 0.1) return 'stable';

  return slope > 0 ? 'improving' : 'declining';
}

// ── Score Projection ──

/**
 * Project where the score will be in N days based on current trend.
 */
export function projectScore(
  promptName: string,
  daysAhead: number,
): { projected: number; confidence: 'low' | 'medium' | 'high' } {
  const records = scoreHistory.getRecent(promptName, 30)
    .filter(r => r.success)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (records.length < 5) return { projected: 0, confidence: 'low' };

  const slope = computeSlope(records);
  const lastScore = records[records.length - 1].overallScore;
  const projected = lastScore + slope * daysAhead;

  // Confidence based on R² (simplified: more records = higher confidence)
  const confidence = records.length >= 20 ? 'high' : records.length >= 10 ? 'medium' : 'low';

  return {
    projected: Math.round(Math.max(0, Math.min(100, projected)) * 10) / 10,
    confidence,
  };
}

// ── Multi-Prompt Trends ──

/**
 * Get trends for all monitored prompts.
 */
export function getAllTrends(windows: TrendWindows): QualityTrend[] {
  const prompts = scoreHistory.getAllPromptNames();
  return prompts.map(name => computeQualityTrend(name, windows));
}
