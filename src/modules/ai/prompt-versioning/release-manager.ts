// ============================================
// Release Manager — lifecycle state tracking & promotion
//
// Integrates with PromptVersionRegistry to add lifecycle
// state management, approval tracking, and release notes.
// ============================================

import type { SemVer } from './prompt-metadata';
import {
  LifecycleState, canTransition, DEFAULT_PROMOTION_RULES,
  LIFECYCLE_LABELS,
} from './release-lifecycle';
import type { PromotionContext, PromotionRule, PromotionCheckResult } from './release-lifecycle';

/** Release metadata attached to a prompt version */
export interface ReleaseMetadata {
  /** Current lifecycle state */
  state: LifecycleState;
  /** When it entered the current state */
  stateEnteredAt: string;
  /** State transition history */
  stateHistory: StateTransition[];
  /** Release notes for this version */
  releaseNotes?: string;
  /** Who approved the release */
  approvedBy?: string;
  /** When it was approved */
  approvedAt?: string;
  /** Reviewers who signed off */
  reviewers?: string[];
  /** When it was promoted to production (if applicable) */
  releasedAt?: string;
  /** Evaluation scores at time of promotion */
  promotionScores?: {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
  };
  /** Custom promotion rules that override defaults */
  customRules?: PromotionRule[];
}

/** A single state transition in the history */
export interface StateTransition {
  from: LifecycleState;
  to: LifecycleState;
  timestamp: string;
  reason: string;
  triggeredBy?: string;
}

/**
 * Release Manager — wraps PromptVersionRegistry with lifecycle management.
 */
class ReleaseManager {
  /** Release metadata per promptId */
  private releases = new Map<string, ReleaseMetadata>();

  // ── State Management ──

  /** Initialize a new prompt version in Draft state */
  initialize(promptId: string, notes?: string): ReleaseMetadata {
    const meta: ReleaseMetadata = {
      state: LifecycleState.Draft,
      stateEnteredAt: new Date().toISOString(),
      stateHistory: [],
      releaseNotes: notes,
    };
    this.releases.set(promptId, meta);
    return structuredClone(meta);
  }

  /** Get release metadata for a prompt version (defensive copy) */
  get(promptId: string): ReleaseMetadata | undefined {
    const meta = this.releases.get(promptId);
    return meta ? structuredClone(meta) : undefined;
  }

  /** Get the current lifecycle state */
  getState(promptId: string): LifecycleState {
    return this.releases.get(promptId)?.state ?? LifecycleState.Draft;
  }

  // ── Promotion ──

  /**
   * Attempt to promote a prompt version to the next state.
   * Returns the check results for all applicable promotion rules.
   */
  checkPromotion(
    promptId: string,
    targetState: LifecycleState,
    context: PromotionContext,
  ): { allowed: boolean; checks: PromotionCheckResult[] } {
    const release = this.releases.get(promptId);
    const currentState = release?.state ?? LifecycleState.Draft;

    if (!canTransition(currentState, targetState)) {
      return {
        allowed: false,
        checks: [{
          passed: false,
          reason: `Cannot transition from ${LIFECYCLE_LABELS[currentState]} to ${LIFECYCLE_LABELS[targetState]}`,
        }],
      };
    }

    // Find applicable promotion rules
    const rules = release?.customRules ?? DEFAULT_PROMOTION_RULES;
    const applicable = rules.filter(r => r.from === currentState && r.to === targetState);

    if (applicable.length === 0) {
      // No rules defined — allow the transition
      return { allowed: true, checks: [] };
    }

    const checks = applicable.map(r => r.check(context));
    return {
      allowed: checks.every(c => c.passed),
      checks,
    };
  }

  /**
   * Promote a prompt version to a new state.
   * Throws if the transition is not allowed.
   */
  promote(
    promptId: string,
    targetState: LifecycleState,
    context: PromotionContext,
  ): ReleaseMetadata {
    const { allowed, checks } = this.checkPromotion(promptId, targetState, context);

    if (!allowed) {
      const failures = checks.filter(c => !c.passed).map(c => c.reason).join('; ');
      throw new Error(`Promotion denied: ${failures}`);
    }

    let release = this.releases.get(promptId);
    if (!release) {
      release = this.initialize(promptId);
    }

    const transition: StateTransition = {
      from: release.state,
      to: targetState,
      timestamp: new Date().toISOString(),
      reason: checks.map(c => c.reason).join(' | '),
      triggeredBy: context.approvedBy,
    };

    release.stateHistory.push(transition);
    release.state = targetState;
    release.stateEnteredAt = transition.timestamp;

    // Track approval
    if (context.humanApproved && context.approvedBy) {
      release.approvedBy = context.approvedBy;
      release.approvedAt = transition.timestamp;
    }

    // Track promotion scores
    if (context.evaluationScores) {
      release.promotionScores = context.evaluationScores;
    }

    // Track release to production
    if (targetState === LifecycleState.Production) {
      release.releasedAt = transition.timestamp;
    }

    this.releases.set(promptId, release);
    return structuredClone(release);
  }

  // ── Rollback ──

  /**
   * Rollback a prompt version to a previous state.
   * Only allowed for Production → ReleaseCandidate and Experimental → Draft.
   */
  rollback(promptId: string, reason: string): ReleaseMetadata {
    const release = this.releases.get(promptId);
    if (!release) throw new Error(`No release found for ${promptId}`);

    let targetState: LifecycleState;
    switch (release.state) {
      case LifecycleState.Production:
        targetState = LifecycleState.ReleaseCandidate;
        break;
      case LifecycleState.ReleaseCandidate:
        targetState = LifecycleState.EvaluationPassed;
        break;
      case LifecycleState.EvaluationPassed:
        targetState = LifecycleState.Experimental;
        break;
      case LifecycleState.Experimental:
        targetState = LifecycleState.Draft;
        break;
      default:
        throw new Error(`Cannot rollback from ${LIFECYCLE_LABELS[release.state]}`);
    }

    const transition: StateTransition = {
      from: release.state,
      to: targetState,
      timestamp: new Date().toISOString(),
      reason: `Rollback: ${reason}`,
    };

    release.stateHistory.push(transition);
    release.state = targetState;
    release.stateEnteredAt = transition.timestamp;
    this.releases.set(promptId, release);
    return structuredClone(release);
  }

  // ── Queries ──

  /** List all prompts in a given lifecycle state */
  listByState(state: LifecycleState): string[] {
    const result: string[] = [];
    for (const [id, meta] of this.releases) {
      if (meta.state === state) result.push(id);
    }
    return result;
  }

  /** List all production prompts */
  listProduction(): string[] {
    return this.listByState(LifecycleState.Production);
  }

  /** Get a summary of release states across all prompts */
  getSummary(): ReleaseSummary {
    const counts: Record<LifecycleState, number> = {
      [LifecycleState.Draft]: 0,
      [LifecycleState.Experimental]: 0,
      [LifecycleState.EvaluationPassed]: 0,
      [LifecycleState.ReleaseCandidate]: 0,
      [LifecycleState.Production]: 0,
      [LifecycleState.Deprecated]: 0,
      [LifecycleState.Archived]: 0,
    };

    for (const [, meta] of this.releases) {
      counts[meta.state]++;
    }

    return {
      total: this.releases.size,
      counts,
      productionCount: counts[LifecycleState.Production],
      releaseCandidateCount: counts[LifecycleState.ReleaseCandidate],
    };
  }
}

/** Summary of all release states */
export interface ReleaseSummary {
  total: number;
  counts: Record<LifecycleState, number>;
  productionCount: number;
  releaseCandidateCount: number;
}

/** Singleton release manager */
export const releaseManager = new ReleaseManager();
