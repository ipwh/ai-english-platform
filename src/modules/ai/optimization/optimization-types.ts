// ============================================
// Sprint 108: Optimization Types
// Deterministic UX optimization layer.
// ============================================

import { computeWeightedScore } from '@/shared/utils/weighted-score';

/** Optimization decision */
export type OptimizationDecision = 'approved' | 'warning' | 'optimized' | 'regenerate_later' | 'reject';

/** Optimization score dimensions */
export interface OptimizationDimensions {
  studentExperience: number; // 30%
  assessment: number;        // 20%
  readability: number;       // 15%
  consistency: number;       // 15%
  difficulty: number;        // 10%
  repairability: number;     // 10%
  overall: number;
}

export const OPTIMIZATION_WEIGHTS: Record<keyof Omit<OptimizationDimensions, 'overall'>, number> = {
  studentExperience: 0.30, assessment: 0.20, readability: 0.15,
  consistency: 0.15, difficulty: 0.10, repairability: 0.10,
};

/** Single optimization check result */
export interface OptimizationCheck {
  ruleId: string;
  passed: boolean;
  action: 'none' | 'repair' | 'replace' | 'normalize' | 'flag';
  score: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  changes: string[];
}

/** Full optimization result */
export interface OptimizationResult {
  decision: OptimizationDecision;
  dimensions: OptimizationDimensions;
  score: number;
  checks: OptimizationCheck[];
  repaired: number;
  flagged: number;
  warnings: string[];
  metadata: { totalChecks: number; passed: number; failed: number; durationMs: number };
}

/** Interface for optimization rules */
export interface OptimizationRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  /** Optimize a question. Returns the (possibly modified) question + check result. */
  optimize(question: Record<string, unknown>, assessmentScore?: number): { question: Record<string, unknown>; check: OptimizationCheck };
}

/** Calculate optimization score from dimension scores. */
export function calculateOptimizationScore(dims: Omit<OptimizationDimensions, 'overall'>): OptimizationDimensions {
  const overall = computeWeightedScore(dims as Record<string, number>, OPTIMIZATION_WEIGHTS as Record<string, number>);
  return { ...dims, overall };
}

/** Determine decision from score and critical failures. */
export function determineOptimizationDecision(score: number, hasCritical: boolean, optimized: boolean): OptimizationDecision {
  if (score >= 85 && !hasCritical) return 'approved';
  if (optimized) return 'optimized';
  if (score >= 50 && !hasCritical) return 'warning';
  if (hasCritical) return 'regenerate_later';
  return 'reject';
}
