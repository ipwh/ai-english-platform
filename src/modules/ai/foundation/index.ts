// ============================================
// Shared PromptOps Foundation — Barrel Export
//
// Every PromptOps module builds upon this
// foundation layer. All exports are stable,
// fully typed, and dependency-free.
//
// Architecture:
//   registry/   → BaseRegistry, VersionedRegistry, HistoryRegistry
//   runner/     → BaseRunner, PipelineRunner
//   lifecycle/  → LifecycleEngine, standard states
//   report/     → ReportBuilder, MarkdownRenderer, JSONRenderer
//   events/     → EventBus, EventDispatcher, typed events
//   metrics/    → MetricsCollector, Counter, Gauge, Histogram, Timer
//   storage/    → Repository, MemoryStore
//   validation/ → validate, assert, collectErrors, common rules
// ============================================

// ── Types ──
export type {
  SemVer,
  Identifiable,
  Versioned,
  Named,
  Timestamped,
  Storable,
  RegistryEntry,
  ValidationResult,
  ValidationError,
  BaseEvent,
  MetricSnapshot,
  ReportFormat,
  RenderedReport,
  PipelineStep,
  PipelineResult,
  StepMetric,
  StateTransition,
  QueryCriteria,
} from './types';

export {
  parseSemVer,
  compareSemVer,
  EventPriority,
} from './types';

// ── Registry ──
export { BaseRegistry } from './registry/base-registry';
export {
  VersionedRegistry,
  type VersionedEntity,
  type VersionLookupOptions,
} from './registry/versioned-registry';
export {
  HistoryRegistry,
  type HistorySnapshot,
} from './registry/history-registry';

// ── Runner ──
export {
  BaseRunner,
  type RunnerContext,
  type RunnerResult,
  type RunnerOptions,
} from './runner/base-runner';
export {
  PipelineRunner,
  type PipelineConfig,
} from './runner/pipeline-runner';

// ── Lifecycle ──
export {
  LifecycleEngine,
  type LifecycleConfig,
  type TransitionValidator,
  type TransitionContext,
  type TransitionResult,
} from './lifecycle/lifecycle-engine';
export {
  StandardLifecycleState,
  STANDARD_PROMPTOPS_TRANSITIONS,
  STANDARD_LIFECYCLE_LABELS,
} from './lifecycle/lifecycle-state';

// ── Report ──
export {
  ReportBuilder,
  MarkdownRenderer,
  JSONRenderer,
  ConsoleRenderer,
  type ReportRenderer,
  type ReportRenderOptions,
  type ReportMetadata,
} from './report/report-builder';
export { MarkdownRenderer as MarkdownReportRenderer } from './report/markdown-renderer';
export { JSONRenderer as JSONReportRenderer } from './report/json-renderer';

// ── Events ──
export { EventBus, type EventSubscriber, type SubscribeOptions } from './events/event-bus';
export { EventDispatcher } from './events/event-dispatcher';
export type {
  PromptOpsEvent,
  PromptOpsEventMap,
  PromptOpsEventType,
  PromptReleasedEvent,
  PromptDeprecatedEvent,
  PromptSnapshotCreatedEvent,
  ExperimentCompletedEvent,
  ExperimentStartedEvent,
  ExperimentFailedEvent,
  EvaluationFinishedEvent,
  RegressionDetectedEvent,
  AlertRaisedEvent,
  AlertResolvedEvent,
  ProviderChangedEvent,
  ProviderHealthChangedEvent,
  ContinuousEvalStartedEvent,
  ContinuousEvalCompletedEvent,
  ContinuousEvalFailedEvent,
  ContinuousEvalTimedOutEvent,
  ContinuousEvalAbortedEvent,
} from './events/event-types';

// ── Metrics ──
export {
  MetricsCollector,
  Counter,
  Gauge,
  Histogram,
  Timer,
  RollingAverage,
} from './metrics/metrics-collector';

// ── Storage ──
export { Repository } from './storage/repository';
export { MemoryStore } from './storage/memory-store';

// ── Validation ──
export {
  validate,
  assert,
  collectErrors,
  required,
  minLength,
  maxLength,
  pattern,
  custom,
  oneOf,
  range,
  combineResults,
  type ValidationRule,
  type NamedRule,
} from './validation/validator';
