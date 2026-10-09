// ============================================
// Prompt Release Management — Lifecycle States & Promotion Rules
//
// Prompt Version ≠ Prompt Release.
// Every version moves through: Draft → Experimental →
// EvaluationPassed → ReleaseCandidate → Production →
// Deprecated → Archived
// ============================================


/** Lifecycle states for prompt versions */
export enum LifecycleState {
  Draft = 'draft',
  Experimental = 'experimental',
  EvaluationPassed = 'evaluation_passed',
  ReleaseCandidate = 'release_candidate',
  Production = 'production',
  Deprecated = 'deprecated',
  Archived = 'archived',
}

/** Allowed state transitions */
export const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  [LifecycleState.Draft]: [
    LifecycleState.Experimental,
    LifecycleState.Archived,
  ],
  [LifecycleState.Experimental]: [
    LifecycleState.EvaluationPassed,
    LifecycleState.Draft,        // rollback
    LifecycleState.Archived,
  ],
  [LifecycleState.EvaluationPassed]: [
    LifecycleState.ReleaseCandidate,
    LifecycleState.Experimental,  // rollback
    LifecycleState.Archived,
  ],
  [LifecycleState.ReleaseCandidate]: [
    LifecycleState.Production,
    LifecycleState.EvaluationPassed, // rollback
    LifecycleState.Archived,
  ],
  [LifecycleState.Production]: [
    LifecycleState.Deprecated,
    LifecycleState.ReleaseCandidate, // emergency rollback
  ],
  [LifecycleState.Deprecated]: [
    LifecycleState.Archived,
    LifecycleState.Production,  // un-deprecate
  ],
  [LifecycleState.Archived]: [
    LifecycleState.Draft,  // resurrect
  ],
};

/** Promotion rules — what must be true to advance */
export interface PromotionRule {
  from: LifecycleState;
  to: LifecycleState;
  /** Human-readable description of the requirement */
  description: string;
  /** Function that checks if promotion is allowed */
  check: (context: PromotionContext) => PromotionCheckResult;
}

/** Context available during promotion evaluation */
export interface PromotionContext {
  /** Current evaluation scores */
  evaluationScores?: {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
  };
  /** Whether CI passed */
  ciPassed?: boolean;
  /** Whether human approval has been granted */
  humanApproved?: boolean;
  /** Approved by (user/team identifier) */
  approvedBy?: string;
  /** Whether regression tests passed */
  regressionPassed?: boolean;
  /** Minimum number of successful evaluations required */
  minEvaluationCount?: number;
  /** Current number of successful evaluations */
  evaluationCount?: number;
}

/** Result of checking a promotion rule */
export interface PromotionCheckResult {
  passed: boolean;
  reason: string;
}

/** Default promotion rules */
export const DEFAULT_PROMOTION_RULES: PromotionRule[] = [
  {
    from: LifecycleState.Draft,
    to: LifecycleState.Experimental,
    description: 'At least one successful evaluation with overall ≥ 70',
    check: (ctx) => ({
      passed: (ctx.evaluationScores?.overall ?? 0) >= 70,
      reason: ctx.evaluationScores
        ? `Evaluation score: ${ctx.evaluationScores.overall}/100 (need ≥ 70)`
        : 'No evaluation data available',
    }),
  },
  {
    from: LifecycleState.Experimental,
    to: LifecycleState.EvaluationPassed,
    description: 'Regression score ≥ 95',
    check: (ctx) => ({
      passed: (ctx.evaluationScores?.overall ?? 0) >= 95,
      reason: ctx.evaluationScores
        ? `Evaluation score: ${ctx.evaluationScores.overall}/100 (need ≥ 95)`
        : 'No evaluation data available',
    }),
  },
  {
    from: LifecycleState.EvaluationPassed,
    to: LifecycleState.ReleaseCandidate,
    description: 'Human approval required',
    check: (ctx) => ({
      passed: ctx.humanApproved === true,
      reason: ctx.humanApproved
        ? `Approved by ${ctx.approvedBy || 'unknown'}`
        : 'Human approval required',
    }),
  },
  {
    from: LifecycleState.ReleaseCandidate,
    to: LifecycleState.Production,
    description: 'CI must pass and evaluation ≥ 90',
    check: (ctx) => ({
      passed: (ctx.ciPassed !== false) && (ctx.evaluationScores?.overall ?? 0) >= 90,
      reason: !ctx.ciPassed
        ? 'CI did not pass'
        : ctx.evaluationScores
          ? `Evaluation score: ${ctx.evaluationScores.overall}/100 (need ≥ 90)`
          : 'No evaluation data',
    }),
  },
  {
    from: LifecycleState.Production,
    to: LifecycleState.Deprecated,
    description: 'Mark as deprecated (no requirements)',
    check: () => ({ passed: true, reason: 'Deprecation requires no checks' }),
  },
  {
    from: LifecycleState.Deprecated,
    to: LifecycleState.Archived,
    description: 'Archive after deprecation (no requirements)',
    check: () => ({ passed: true, reason: 'Archival requires no checks' }),
  },
];

// ── State helpers ──

/** Human-readable label for each state */
export const LIFECYCLE_LABELS: Record<LifecycleState, string> = {
  [LifecycleState.Draft]: 'Draft',
  [LifecycleState.Experimental]: 'Experimental',
  [LifecycleState.EvaluationPassed]: 'Evaluation Passed',
  [LifecycleState.ReleaseCandidate]: 'Release Candidate',
  [LifecycleState.Production]: 'Production',
  [LifecycleState.Deprecated]: 'Deprecated',
  [LifecycleState.Archived]: 'Archived',
};

/** Emoji for each lifecycle state */
export const LIFECYCLE_ICONS: Record<LifecycleState, string> = {
  [LifecycleState.Draft]: '📝',
  [LifecycleState.Experimental]: '🧪',
  [LifecycleState.EvaluationPassed]: '✅',
  [LifecycleState.ReleaseCandidate]: '🚀',
  [LifecycleState.Production]: '🏭',
  [LifecycleState.Deprecated]: '⚠️',
  [LifecycleState.Archived]: '📦',
};

/** Whether a state is considered "active" (can be used in production) */
export function isActive(state: LifecycleState): boolean {
  return state === LifecycleState.Production;
}

/** Whether a state is considered "stable" (production or release candidate) */
export function isStable(state: LifecycleState): boolean {
  return state === LifecycleState.Production ||
         state === LifecycleState.ReleaseCandidate;
}

/** Whether a transition is allowed */
export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Foundation Integration ──

import { LifecycleEngine } from '../foundation';

/**
 * Pre-configured LifecycleEngine for prompt release lifecycle.
 *
 * Built on the shared PromptOps Foundation's LifecycleEngine.
 * Provides transition(), rollback(), history(), and canTransition()
 * with the standard PromptOps states and transitions.
 *
 * @example
 * ```ts
 * import { promptLifecycleEngine } from './release-lifecycle';
 *
 * // Check if a transition is allowed
 * const canPromote = promptLifecycleEngine.canTransition('production');
 *
 * // Execute a transition
 * const result = promptLifecycleEngine.transition('production', {
 *   ciPassed: true,
 *   evaluationScores: { overall: 95, rubric: 90, semantic: 92, structural: 100 },
 * });
 * ```
 */
export const promptLifecycleEngine = new LifecycleEngine<LifecycleState>({
  initialState: LifecycleState.Draft,
  transitions: ALLOWED_TRANSITIONS,
  labels: LIFECYCLE_LABELS,
});
