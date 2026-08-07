// ============================================
// Shared PromptOps Foundation — Core Types
//
// All foundation-level types that every PromptOps
// module builds upon. Zero external dependencies.
// ============================================

// ── SemVer ──

/**
 * Semantic version string (e.g. "1.0.0", "2.1.3-beta.1").
 * Follows semver.org specification: MAJOR.MINOR.PATCH[-PRERELEASE]
 */
export type SemVer = string;

/**
 * Parse a SemVer string into its numeric components.
 * Returns null if the string is not a valid semver.
 */
export function parseSemVer(version: SemVer): { major: number; minor: number; patch: number; prerelease?: string } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two SemVer strings.
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  // Prerelease versions sort before release versions
  if (!pa.prerelease && !pb.prerelease) return 0;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  return (pa.prerelease ?? '').localeCompare(pb.prerelease ?? '');
}

// ── Identifiable ──

/**
 * Any entity that has a unique string identifier.
 * Core constraint for all registries and repositories.
 */
export interface Identifiable {
  id: string;
}

// ── Versioned ──

/**
 * Any entity that carries a version identifier.
 */
export interface Versioned {
  version: SemVer;
}

// ── Named ──

/**
 * Any entity that carries a human-readable name.
 */
export interface Named {
  name: string;
}

// ── Timestamped ──

/**
 * Any entity with creation/update timestamps.
 */
export interface Timestamped {
  createdAt: string;
  updatedAt?: string;
}

// ── Storable ──

/**
 * Union type for stored entities. Every storable
 * entity must be at minimum Identifiable.
 */
export type Storable = Identifiable;

// ── Registry Entry ──

/**
 * A registered entry with metadata about its registration.
 */
export interface RegistryEntry<T> {
  /** The registered item */
  item: T;
  /** When the item was registered */
  registeredAt: string;
  /** Version index (monotonically increasing per key) */
  version: number;
}

// ── Validation ──

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of error messages (empty if valid) */
  errors: string[];
  /** List of warning messages */
  warnings: string[];
}

/**
 * A single validation error.
 */
export interface ValidationError {
  /** Field or path that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Optional error code for programmatic handling */
  code?: string;
}

// ── Events ──

/**
 * Priority level for events.
 */
export enum EventPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Critical = 3,
}

/**
 * Base event type that all typed events extend.
 */
export interface BaseEvent {
  /** Unique event type identifier */
  type: string;
  /** When the event was created */
  timestamp: string;
  /** Optional event correlation ID */
  correlationId?: string;
}

// ── Metrics ──

/**
 * A single metric snapshot.
 */
export interface MetricSnapshot {
  /** Metric name */
  name: string;
  /** Current value */
  value: number;
  /** Labels for dimensional queries */
  labels: Record<string, string>;
  /** When this snapshot was taken */
  timestamp: string;
}

// ── Report ──

/**
 * Supported report output formats.
 */
export type ReportFormat = 'markdown' | 'json' | 'console' | 'html';

/**
 * A rendered report with its format metadata.
 */
export interface RenderedReport {
  /** Report content as a string */
  content: string;
  /** Format of the content */
  format: ReportFormat;
  /** MIME type for transport */
  mimeType: string;
}

// ── Runner ──

/**
 * A single step in a pipeline.
 */
export interface PipelineStep<TInput, TOutput> {
  /** Step name (used for logging/debugging) */
  name: string;
  /** Execute this step */
  execute: (input: TInput) => Promise<TOutput>;
  /** Optional: validate input before execution */
  validate?: (input: TInput) => ValidationResult;
}

/**
 * Result of a pipeline execution.
 */
export interface PipelineResult<T> {
  /** Whether the pipeline succeeded */
  success: boolean;
  /** Final output (if success) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** Per-step metrics */
  stepMetrics: StepMetric[];
  /** Total execution time in ms */
  totalDurationMs: number;
}

/**
 * Metrics for a single pipeline step.
 */
export interface StepMetric {
  step: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ── Lifecycle ──

/**
 * A state transition in a lifecycle.
 */
export interface StateTransition<S extends string> {
  /** Source state */
  from: S;
  /** Target state */
  to: S;
  /** When the transition occurred */
  timestamp: string;
  /** Optional reason for the transition */
  reason?: string;
  /** Optional actor who initiated the transition */
  actor?: string;
}

// ── Repository ──

/**
 * Query criteria for repository operations.
 */
export interface QueryCriteria<T> {
  /** Filter predicate */
  filter?: (item: T) => boolean;
  /** Sort comparator */
  sort?: (a: T, b: T) => number;
  /** Maximum results */
  limit?: number;
  /** Skip first N results */
  offset?: number;
}
