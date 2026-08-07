// ============================================
// LifecycleState — Re-export and convenience
// utilities for lifecycle state management.
//
// This module provides the state definitions that
// LifecycleEngine uses, along with common lifecycle
// patterns found across PromptOps modules.
// ============================================

export type {
  LifecycleConfig,
  TransitionValidator,
  TransitionContext,
  TransitionResult,
} from './lifecycle-engine';

export { LifecycleEngine } from './lifecycle-engine';

/**
 * Standard lifecycle states used across PromptOps.
 * Modules can extend or restrict these as needed.
 */
export enum StandardLifecycleState {
  Draft = 'draft',
  Experimental = 'experimental',
  EvaluationPassed = 'evaluation_passed',
  ReleaseCandidate = 'release_candidate',
  Production = 'production',
  Deprecated = 'deprecated',
  Archived = 'archived',
}

/**
 * The standard PromptOps lifecycle: Draft → Experimental →
 * EvaluationPassed → ReleaseCandidate → Production →
 * Deprecated → Archived.
 *
 * This mirrors the existing `ALLOWED_TRANSITIONS` in
 * `prompt-versioning/release-lifecycle.ts`.
 */
export const STANDARD_PROMPTOPS_TRANSITIONS: Record<StandardLifecycleState, StandardLifecycleState[]> = {
  [StandardLifecycleState.Draft]: [
    StandardLifecycleState.Experimental,
    StandardLifecycleState.Archived,
  ],
  [StandardLifecycleState.Experimental]: [
    StandardLifecycleState.EvaluationPassed,
    StandardLifecycleState.Draft,
    StandardLifecycleState.Archived,
  ],
  [StandardLifecycleState.EvaluationPassed]: [
    StandardLifecycleState.ReleaseCandidate,
    StandardLifecycleState.Experimental,
    StandardLifecycleState.Archived,
  ],
  [StandardLifecycleState.ReleaseCandidate]: [
    StandardLifecycleState.Production,
    StandardLifecycleState.EvaluationPassed,
    StandardLifecycleState.Archived,
  ],
  [StandardLifecycleState.Production]: [
    StandardLifecycleState.Deprecated,
    StandardLifecycleState.ReleaseCandidate,
  ],
  [StandardLifecycleState.Deprecated]: [
    StandardLifecycleState.Archived,
    StandardLifecycleState.Production,
  ],
  [StandardLifecycleState.Archived]: [
    StandardLifecycleState.Draft,
  ],
};

/**
 * Human-readable labels for standard lifecycle states.
 */
export const STANDARD_LIFECYCLE_LABELS: Record<StandardLifecycleState, string> = {
  [StandardLifecycleState.Draft]: 'Draft',
  [StandardLifecycleState.Experimental]: 'Experimental',
  [StandardLifecycleState.EvaluationPassed]: 'Evaluation Passed',
  [StandardLifecycleState.ReleaseCandidate]: 'Release Candidate',
  [StandardLifecycleState.Production]: 'Production',
  [StandardLifecycleState.Deprecated]: 'Deprecated',
  [StandardLifecycleState.Archived]: 'Archived',
};
