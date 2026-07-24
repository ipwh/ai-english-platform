// ============================================
// Sprint 110: Feedback Types
// Deterministic closed-loop feedback. No AI calls.
// ============================================

// ═══ Feedback Event ═══

/** Source layers that produce feedback */
export type FeedbackSource =
  | 'quality'
  | 'repair'
  | 'evaluation'
  | 'assessment'
  | 'optimization'
  | 'self-reflection';

/** Severity of the feedback event */
export type FeedbackSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Feedback category for grouping */
export type FeedbackCategory =
  | 'structure'
  | 'content'
  | 'consistency'
  | 'pedagogy'
  | 'assessment'
  | 'answer'
  | 'explanation'
  | 'options'
  | 'difficulty'
  | 'prompt'
  | 'readability'
  | 'reliability';

/** A single normalized feedback event from any layer */
export interface FeedbackEvent {
  /** Unique event ID */
  id: string;
  /** Source layer */
  source: FeedbackSource;
  /** Rule ID that triggered this feedback (e.g. 'qual:answer-field', 'eval:mcq-answer') */
  rule: string;
  /** Human-readable rule name */
  ruleName?: string;
  /** Severity */
  severity: FeedbackSeverity;
  /** Category for grouping */
  category: FeedbackCategory;
  /** Which dimension was affected (e.g. 'structure', 'consistency') */
  dimension?: string;
  /** Whether this failure is repairable */
  repairable: boolean;
  /** Score (0-100) associated with this event if applicable */
  score?: number;
  /** Duration in ms if applicable */
  durationMs?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  timestamp: string;
}

// ═══ Pattern Types ═══

/** Types of patterns that can be detected */
export type PatternType =
  | 'RepeatedFailure'
  | 'HighRepairRate'
  | 'LowAssessment'
  | 'LowReflection'
  | 'PoorEvaluation'
  | 'PromptWeakness';

/** A detected pattern from feedback analysis */
export interface DetectedPattern {
  /** Pattern type */
  type: PatternType;
  /** Rule ID most affected */
  rule?: string;
  /** Category most affected */
  category?: FeedbackCategory;
  /** Dimension with low scores */
  dimension?: string;
  /** Number of occurrences */
  occurrenceCount: number;
  /** Average score if applicable */
  avgScore?: number;
  /** Repair rate if applicable (0-1) */
  repairRate?: number;
  /** Confidence that this is a real pattern (0-1) */
  confidence: number;
  /** Suggested constraint to inject */
  suggestedConstraint: string;
  /** Timestamp of detection */
  detectedAt: string;
}

// ═══ Knowledge Types ═══

/** A knowledge item derived from detected patterns */
export interface KnowledgeItem {
  /** Unique knowledge ID */
  id: string;
  /** Source rule that generated this knowledge */
  rule: string;
  /** What triggers this knowledge activation */
  trigger: string;
  /** The constraint text to inject into prompts */
  constraint: string;
  /** Priority (higher = more important) */
  priority: number; // 1-100
  /** Confidence in this knowledge (0-1) */
  confidence: number;
  /** Minimum number of failures before this knowledge activates */
  activationThreshold: number;
  /** How many times this has been activated */
  activationCount: number;
  /** Whether this knowledge is currently enabled */
  enabled: boolean;
  /** When this knowledge was created */
  createdAt: string;
  /** When this knowledge was last activated */
  lastTriggered?: string;
  /** When this knowledge was last updated */
  updatedAt: string;
  /** Category */
  category: FeedbackCategory;
}

/** Knowledge state snapshot */
export interface KnowledgeState {
  items: KnowledgeItem[];
  totalCount: number;
  enabledCount: number;
  disabledCount: number;
  averageConfidence: number;
  averagePriority: number;
  totalActivations: number;
}

// ═══ Learning Types ═══

/** Learning event: pattern → knowledge conversion */
export interface LearningEvent {
  /** Pattern that triggered learning */
  pattern: DetectedPattern;
  /** Resulting knowledge item (null if below threshold) */
  knowledge?: KnowledgeItem;
  /** Whether knowledge was created or updated */
  action: 'created' | 'updated' | 'skipped' | 'expired';
  /** Reason for action */
  reason: string;
  timestamp: string;
}

// ═══ Constraint Types ═══

/** Dynamic constraint derived from knowledge */
export interface DynamicConstraint {
  /** The constraint text */
  text: string;
  /** Priority (higher = ordered first) */
  priority: number;
  /** Confidence */
  confidence: number;
  /** Activation count */
  activationCount: number;
  /** Source knowledge ID */
  knowledgeId: string;
  /** When added */
  addedAt: string;
  /** Last activated */
  lastActivated?: string;
}

// ═══ Feedback Summary ═══

export interface FeedbackSummary {
  totalEvents: number;
  bySource: Record<FeedbackSource, number>;
  byCategory: Record<FeedbackCategory, number>;
  bySeverity: Record<FeedbackSeverity, number>;
  topFailingRules: Array<{ rule: string; count: number }>;
  averageScore: number;
  repairRate: number;
  timestamp: string;
}

/** Constants */
export const MAX_DYNAMIC_CONSTRAINTS = 20;
export const DEFAULT_ACTIVATION_THRESHOLD = 20;
export const PATTERN_DETECTION_WINDOW = 500; // last N events to analyze
export const KNOWLEDGE_EXPIRY_DAYS = 30; // days before inactive knowledge expires
