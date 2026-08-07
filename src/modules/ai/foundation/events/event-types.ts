// ============================================
// Event Types — Typed event definitions for
// the PromptOps event bus.
//
// All events that flow through the platform are
// defined here with strong typing.
// ============================================

import type { BaseEvent } from '../types';

// ── Prompt Events ──

/**
 * Fired when a prompt version is released to production.
 */
export interface PromptReleasedEvent extends BaseEvent {
  type: 'prompt:released';
  /** The prompt name */
  promptName: string;
  /** The released version */
  version: string;
  /** The previous production version (if any) */
  previousVersion?: string;
  /** Who initiated the release */
  releasedBy?: string;
}

/**
 * Fired when a prompt is deprecated.
 */
export interface PromptDeprecatedEvent extends BaseEvent {
  type: 'prompt:deprecated';
  promptName: string;
  version: string;
  reason?: string;
}

/**
 * Fired when a prompt snapshot is created.
 */
export interface PromptSnapshotCreatedEvent extends BaseEvent {
  type: 'prompt:snapshotCreated';
  promptName: string;
  version: string;
  snapshotId: string;
}

// ── Experiment Events ──

/**
 * Fired when an experiment completes.
 */
export interface ExperimentCompletedEvent extends BaseEvent {
  type: 'experiment:completed';
  experimentId: string;
  experimentName: string;
  /** Whether a winner was found */
  hasWinner: boolean;
  /** Winner variant ID (if applicable) */
  winnerVariantId?: string;
  /** Confidence score (0-100) */
  confidenceScore?: number;
  /** Total duration in ms */
  durationMs: number;
}

/**
 * Fired when an experiment starts.
 */
export interface ExperimentStartedEvent extends BaseEvent {
  type: 'experiment:started';
  experimentId: string;
  experimentName: string;
  /** Number of variants */
  variantCount: number;
  /** Expected run count */
  estimatedRuns: number;
}

/**
 * Fired when an experiment fails.
 */
export interface ExperimentFailedEvent extends BaseEvent {
  type: 'experiment:failed';
  experimentId: string;
  experimentName: string;
  error: string;
}

// ── Evaluation Events ──

/**
 * Fired when a regression evaluation finishes.
 */
export interface EvaluationFinishedEvent extends BaseEvent {
  type: 'evaluation:finished';
  /** Prompt evaluated */
  promptName: string;
  /** Overall score (0-100) */
  overallScore: number;
  /** Whether all fixtures passed */
  allPassed: boolean;
  /** Number of fixtures */
  fixtureCount: number;
  /** Score delta vs previous */
  scoreDelta?: number;
}

/**
 * Fired when a regression is detected.
 */
export interface RegressionDetectedEvent extends BaseEvent {
  type: 'evaluation:regressionDetected';
  promptName: string;
  /** Current score */
  currentScore: number;
  /** Previous score */
  previousScore: number;
  /** Score drop */
  drop: number;
  /** Severity */
  severity: 'minor' | 'major' | 'critical';
}

// ── Alert Events ──

/**
 * Fired when an alert is raised.
 */
export interface AlertRaisedEvent extends BaseEvent {
  type: 'alert:raised';
  alertId: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  category: string;
  promptName: string;
  title: string;
  description: string;
}

/**
 * Fired when an alert is resolved.
 */
export interface AlertResolvedEvent extends BaseEvent {
  type: 'alert:resolved';
  alertId: string;
  resolvedBy?: string;
}

// ── Provider Events ──

/**
 * Fired when the primary AI provider changes.
 */
export interface ProviderChangedEvent extends BaseEvent {
  type: 'provider:changed';
  /** New primary provider */
  newProvider: string;
  /** Previous primary provider */
  previousProvider: string;
  /** Reason for the change */
  reason: 'manual' | 'fallback' | 'circuit_breaker' | 'degradation';
}

/**
 * Fired when a provider's health status changes.
 */
export interface ProviderHealthChangedEvent extends BaseEvent {
  type: 'provider:healthChanged';
  provider: string;
  previousStatus: string;
  newStatus: string;
  /** Error rate (0-1) */
  errorRate: number;
}

// ── Union Type ──

/**
 * All typed PromptOps events.
 * Extend this union as new event types are added.
 */
export type PromptOpsEvent =
  | PromptReleasedEvent
  | PromptDeprecatedEvent
  | PromptSnapshotCreatedEvent
  | ExperimentCompletedEvent
  | ExperimentStartedEvent
  | ExperimentFailedEvent
  | EvaluationFinishedEvent
  | RegressionDetectedEvent
  | AlertRaisedEvent
  | AlertResolvedEvent
  | ProviderChangedEvent
  | ProviderHealthChangedEvent;

/**
 * Map of event type string → event interface.
 * Used for type-safe subscription.
 */
export interface PromptOpsEventMap {
  'prompt:released': PromptReleasedEvent;
  'prompt:deprecated': PromptDeprecatedEvent;
  'prompt:snapshotCreated': PromptSnapshotCreatedEvent;
  'experiment:completed': ExperimentCompletedEvent;
  'experiment:started': ExperimentStartedEvent;
  'experiment:failed': ExperimentFailedEvent;
  'evaluation:finished': EvaluationFinishedEvent;
  'evaluation:regressionDetected': RegressionDetectedEvent;
  'alert:raised': AlertRaisedEvent;
  'alert:resolved': AlertResolvedEvent;
  'provider:changed': ProviderChangedEvent;
  'provider:healthChanged': ProviderHealthChangedEvent;
}

/**
 * All known event type strings.
 */
export type PromptOpsEventType = keyof PromptOpsEventMap;
