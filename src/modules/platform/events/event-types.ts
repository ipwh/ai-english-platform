// Sprint 85: Event Types — canonical domain event type constants

export const EventTypes = {
  // Student events
  STUDENT_XP_AWARDED: 'student.xp_awarded',
  STUDENT_LEVEL_UP: 'student.level_up',
  STUDENT_STREAK_UPDATED: 'student.streak_updated',
  STUDENT_MASTERY_CHANGED: 'student.mastery_changed',
  STUDENT_BADGE_EARNED: 'student.badge_earned',

  // Practice events
  PRACTICE_COMPLETED: 'practice.completed',
  PRACTICE_STARTED: 'practice.started',

  // Diagnostic events
  DIAGNOSTIC_COMPLETED: 'diagnostic.completed',

  // Writing events
  WRITING_SUBMITTED: 'writing.submitted',
  WRITING_ANALYZED: 'writing.analyzed',

  // Memory events
  MEMORY_UPDATED: 'memory.updated',
  MEMORY_DECAYED: 'memory.decayed',

  // Mistake events
  MISTAKE_RECORDED: 'mistake.recorded',

  // AI events
  AI_REQUEST_STARTED: 'ai.request_started',
  AI_REQUEST_SUCCEEDED: 'ai.request_succeeded',
  AI_REQUEST_FAILED: 'ai.request_failed',
  AI_PROVIDER_FALLBACK: 'ai.provider_fallback',
  AI_BUDGET_EXCEEDED: 'ai.budget_exceeded',

  // Learning events
  RECOMMENDATION_GENERATED: 'learning.recommendation_generated',
  DIFFICULTY_ADJUSTED: 'learning.difficulty_adjusted',

  // Experiment events
  EXPERIMENT_ASSIGNED: 'experiment.assigned',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];
