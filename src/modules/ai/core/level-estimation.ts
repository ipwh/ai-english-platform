// ============================================
// Cross-paper level estimation policy — 0-100 → internal 1-5 estimate
// ============================================
// Paper 2 Writing derives its level from the CLO total (0-21) using
// `estimateDSELevelFromCLO` (thresholds 16/13/10/7). Papers whose scores
// are already expressed as a 0-100 percentage (e.g. Paper 3 Integrated
// Skills) must map that percentage to the SAME level so a given displayed
// percentage means the same level across papers.
//
// Thresholds below are the rounded percentage equivalents of the Paper 2
// CLO thresholds (16/21≈76%, 13/21≈62%, 10/21≈48%, 7/21≈33%). This is a
// PLATFORM_DEFINED policy — HKEAA publishes Level 1-5 DESCRIPTORS only and
// defines NO numeric score-to-level conversion.
// ============================================

import type { EstimatedDSELevel } from './writing-score-policy';

/**
 * Map a 0-100 platform score to the internal platform level estimate (1-5).
 * Same percentage → same level as a Paper 2 essay with that displayed score.
 */
export function estimateLevelFromScore100(score: number): EstimatedDSELevel {
  if (!Number.isFinite(score)) return '1';
  if (score >= 76) return '5';
  if (score >= 62) return '4';
  if (score >= 48) return '3';
  if (score >= 33) return '2';
  return '1';
}
