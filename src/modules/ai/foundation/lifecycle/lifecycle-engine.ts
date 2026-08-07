// ============================================
// LifecycleState & LifecycleEngine — Generic
// state machine with configurable states,
// transitions, validation hooks, and rollback.
//
// Generalizes the prompt release lifecycle for
// reuse across any stateful entity.
// ============================================

import type { StateTransition } from '../types';

// ── Types ──

/**
 * Configuration for a lifecycle state machine.
 *
 * @typeParam S — String enum of state names
 */
export interface LifecycleConfig<S extends string> {
  /** Initial state */
  initialState: S;
  /** Allowed transitions: from → to[] */
  transitions: Record<S, S[]>;
  /** Human-readable labels for each state */
  labels?: Partial<Record<S, string>>;
  /** Validation hooks called before transitions */
  validators?: Partial<Record<string, TransitionValidator<S>>>;
}

/**
 * A validator that runs before a transition is executed.
 * Return an error string to block the transition.
 */
export type TransitionValidator<S extends string> = (
  context: TransitionContext<S>,
) => string | null;

/**
 * Context available to transition validators.
 */
export interface TransitionContext<S extends string> {
  /** Current state */
  from: S;
  /** Target state */
  to: S;
  /** Full transition history */
  history: StateTransition<S>[];
  /** Arbitrary metadata (set by the caller) */
  metadata: Record<string, unknown>;
}

/**
 * Result of a transition attempt.
 */
export interface TransitionResult<S extends string> {
  /** Whether the transition succeeded */
  success: boolean;
  /** The new state (same as from if blocked) */
  state: S;
  /** Error message if blocked */
  error?: string;
  /** The transition record (if successful) */
  transition?: StateTransition<S>;
}

// ── Engine ──

/**
 * A generic, configurable lifecycle state machine.
 *
 * Supports:
 * - Configurable states and transitions
 * - Transition validation hooks
 * - Full transition history
 * - Rollback to previous state
 * - Immutable history records
 *
 * @typeParam S — String enum of possible states
 *
 * @example
 * ```ts
 * type States = 'draft' | 'review' | 'published' | 'archived';
 *
 * const engine = new LifecycleEngine<States>({
 *   initialState: 'draft',
 *   transitions: {
 *     draft: ['review', 'archived'],
 *     review: ['published', 'draft'],
 *     published: ['archived'],
 *     archived: ['draft'],
 *   },
 *   validators: {
 *     'review→published': (ctx) => ctx.metadata.approved ? null : 'Approval required',
 *   },
 * });
 * ```
 */
export class LifecycleEngine<S extends string> {
  private currentState: S;
  private transitionHistory: StateTransition<S>[] = [];
  private readonly config: Required<Pick<LifecycleConfig<S>, 'transitions'>> & LifecycleConfig<S>;

  constructor(config: LifecycleConfig<S>) {
    this.config = {
      ...config,
      transitions: config.transitions,
      labels: config.labels ?? {},
      validators: config.validators ?? {},
    };
    this.currentState = config.initialState;
  }

  // ── State Access ──

  /**
   * Get the current state.
   */
  get state(): S {
    return this.currentState;
  }

  /**
   * Get the human-readable label for a state.
   */
  label(state?: S): string {
    const s = state ?? this.currentState;
    return this.config.labels?.[s] ?? s;
  }

  // ── Transition ──

  /**
   * Attempt to transition to a new state.
   *
   * @param to — Target state
   * @param metadata — Optional metadata for validators
   * @param actor — Optional actor name for the transition record
   * @param reason — Optional reason for the transition
   * @returns Transition result
   */
  transition(
    to: S,
    metadata: Record<string, unknown> = {},
    actor?: string,
    reason?: string,
  ): TransitionResult<S> {
    // Check if transition is allowed
    if (!this.canTransition(to)) {
      const allowed = this.allowedTransitions();
      return {
        success: false,
        state: this.currentState,
        error: `Cannot transition from "${this.currentState}" to "${to}". ` +
               `Allowed: [${allowed.join(', ')}]`,
      };
    }

    // Run validators
    const validatorError = this.runValidators(this.currentState, to, metadata);
    if (validatorError) {
      return {
        success: false,
        state: this.currentState,
        error: validatorError,
      };
    }

    // Execute transition
    const from = this.currentState;
    this.currentState = to;

    const transitionRecord: StateTransition<S> = {
      from,
      to,
      timestamp: new Date().toISOString(),
      reason,
      actor,
    };

    this.transitionHistory.push(transitionRecord);

    return {
      success: true,
      state: this.currentState,
      transition: transitionRecord,
    };
  }

  /**
   * Check if a transition to the given state is allowed.
   */
  canTransition(to: S): boolean {
    const allowed = this.config.transitions[this.currentState];
    if (!allowed) return false;
    return allowed.includes(to);
  }

  /**
   * List all allowed transitions from the current state.
   */
  allowedTransitions(): S[] {
    return [...(this.config.transitions[this.currentState] ?? [])];
  }

  // ── Rollback ──

  /**
   * Roll back to the previous state.
   * The previous state is determined from the transition history.
   *
   * @param reason — Optional reason for the rollback
   * @returns Transition result
   */
  rollback(reason?: string): TransitionResult<S> {
    if (this.transitionHistory.length === 0) {
      return {
        success: false,
        state: this.currentState,
        error: 'No previous state to roll back to.',
      };
    }

    const lastTransition = this.transitionHistory[this.transitionHistory.length - 1];
    return this.transition(lastTransition.from, {}, undefined, reason ?? 'Rollback');
  }

  /**
   * Roll back to a specific state by walking the history.
   *
   * @param targetState — The state to roll back to
   * @param reason — Optional reason
   * @returns Transition result
   */
  rollbackTo(targetState: S, reason?: string): TransitionResult<S> {
    if (this.currentState === targetState) {
      return { success: true, state: this.currentState };
    }

    // Walk history backward to find the target state
    let found = false;
    for (let i = this.transitionHistory.length - 1; i >= 0; i--) {
      if (this.transitionHistory[i].from === targetState) {
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        success: false,
        state: this.currentState,
        error: `State "${targetState}" not found in transition history.`,
      };
    }

    return this.transition(targetState, {}, undefined, reason ?? 'Rollback');
  }

  // ── History ──

  /**
   * Get the full transition history (immutable copy).
   */
  history(): StateTransition<S>[] {
    return [...this.transitionHistory];
  }

  /**
   * Get the number of transitions that have occurred.
   */
  get transitionCount(): number {
    return this.transitionHistory.length;
  }

  /**
   * Reset to the initial state and clear history.
   */
  reset(): void {
    this.currentState = this.config.initialState;
    this.transitionHistory = [];
  }

  // ── Internal ──

  /**
   * Run all matching validators for a transition.
   * Returns the first error, or null if all pass.
   */
  private runValidators(
    from: S,
    to: S,
    metadata: Record<string, unknown>,
  ): string | null {
    const ctx: TransitionContext<S> = {
      from,
      to,
      history: this.history(),
      metadata,
    };

    // Check exact match: "from→to"
    const exactKey = `${from}→${to}`;
    const exactValidator = this.config.validators?.[exactKey];
    if (exactValidator) {
      const error = exactValidator(ctx);
      if (error) return error;
    }

    // Check wildcard from: "from→*"
    const fromWildcard = `${from}→*`;
    const fromValidator = this.config.validators?.[fromWildcard];
    if (fromValidator) {
      const error = fromValidator(ctx);
      if (error) return error;
    }

    // Check wildcard to: "*→to"
    const toWildcard = `*→${to}`;
    const toValidator = this.config.validators?.[toWildcard];
    if (toValidator) {
      const error = toValidator(ctx);
      if (error) return error;
    }

    return null;
  }
}
