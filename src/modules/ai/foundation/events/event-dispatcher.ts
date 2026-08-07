// ============================================
// EventDispatcher — Convenience wrapper around
// EventBus for common PromptOps event emission
// patterns.
//
// Provides typed helper methods for each event
// type, reducing boilerplate in module code.
// ============================================

import { EventBus } from './event-bus';
import type {
  PromptReleasedEvent,
  ExperimentCompletedEvent,
  ExperimentStartedEvent,
  ExperimentFailedEvent,
  EvaluationFinishedEvent,
  RegressionDetectedEvent,
  AlertRaisedEvent,
  AlertResolvedEvent,
  ProviderChangedEvent,
  ProviderHealthChangedEvent,
} from './event-types';

/**
 * A convenience dispatcher that wraps {@link EventBus}
 * with typed helper methods for every PromptOps event.
 *
 * @example
 * ```ts
 * const dispatcher = new EventDispatcher(bus);
 *
 * // Instead of constructing events manually:
 * dispatcher.experimentCompleted({
 *   experimentId: 'exp-1',
 *   experimentName: 'Reading V12',
 *   hasWinner: true,
 *   winnerVariantId: 'B',
 *   confidenceScore: 95,
 *   durationMs: 12000,
 * });
 * ```
 */
export class EventDispatcher {
  constructor(private readonly bus: EventBus) {}

  // ── Prompt Events ──

  /** Emit a prompt:released event */
  promptReleased(params: Omit<PromptReleasedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'prompt:released',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  /** Emit a prompt:deprecated event */
  promptDeprecated(params: Omit<import('./event-types').PromptDeprecatedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'prompt:deprecated',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  // ── Experiment Events ──

  /** Emit an experiment:started event */
  experimentStarted(params: Omit<ExperimentStartedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'experiment:started',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  /** Emit an experiment:completed event */
  experimentCompleted(params: Omit<ExperimentCompletedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'experiment:completed',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  /** Emit an experiment:failed event */
  experimentFailed(params: Omit<ExperimentFailedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'experiment:failed',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  // ── Evaluation Events ──

  /** Emit an evaluation:finished event */
  evaluationFinished(params: Omit<EvaluationFinishedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'evaluation:finished',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  /** Emit an evaluation:regressionDetected event */
  regressionDetected(params: Omit<RegressionDetectedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'evaluation:regressionDetected',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  // ── Alert Events ──

  /** Emit an alert:raised event */
  alertRaised(params: Omit<AlertRaisedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'alert:raised',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  /** Emit an alert:resolved event */
  alertResolved(params: Omit<AlertResolvedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'alert:resolved',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  // ── Provider Events ──

  /** Emit a provider:changed event */
  providerChanged(params: Omit<ProviderChangedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'provider:changed',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }

  /** Emit a provider:healthChanged event */
  providerHealthChanged(params: Omit<ProviderHealthChangedEvent, 'type' | 'timestamp'>): void {
    this.bus.emit({
      type: 'provider:healthChanged',
      timestamp: new Date().toISOString(),
      ...params,
    });
  }
}
