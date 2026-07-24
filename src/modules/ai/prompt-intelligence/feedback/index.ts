// ============================================
// Sprint 110: Adaptive Feedback — Barrel Export
// ============================================

// Types
export type {
  FeedbackEvent, FeedbackSource, FeedbackSeverity, FeedbackCategory,
  DetectedPattern, PatternType, KnowledgeItem, KnowledgeState,
  DynamicConstraint, FeedbackSummary, LearningEvent,
} from './feedback-types';
export { MAX_DYNAMIC_CONSTRAINTS, DEFAULT_ACTIVATION_THRESHOLD } from './feedback-types';

// Engine
export {
  initFeedbackEngine,
  collectFeedback,
  collectAllFeedback,
  runFeedbackCycle,
} from './feedback-engine';

// Registry
export {
  registerFeedbackCollector,
  getFeedbackCollector,
  getAllCollectors,
  hasCollector,
  unregisterCollector,
  getRegisteredSources,
  clearCollectorRegistry,
  type FeedbackCollector,
} from './feedback-registry';

// History
export {
  recordFeedbackEvent,
  recordFeedbackEvents,
  getFeedbackHistory,
  getEventsBySource,
  getEventsByRule,
  getEventsByCategory,
  getFailureEvents,
  getRecentEvents,
  getEventsSince,
  countEventsBy,
  clearFeedbackHistory,
  getFeedbackEventCount,
} from './feedback-history';

// Pattern Detection
export { detectPatterns, detectPatternsForRule } from './feedback-pattern';

// Knowledge Base
export {
  upsertKnowledge,
  getKnowledge,
  findKnowledgeByRule,
  getAllKnowledge,
  getEnabledKnowledge,
  getKnowledgeByCategory,
  activateKnowledge,
  disableKnowledge,
  enableKnowledge,
  removeKnowledge,
  expireInactiveKnowledge,
  getDynamicConstraints,
  getKnowledgeState,
  clearKnowledge,
} from './feedback-knowledge';

// Learning Engine
export { runLearningCycle, getLearningHistory, clearLearningHistory } from './feedback-learning';

// Metrics
export {
  recordFeedbackCollected,
  recordFeedbackNormalized,
  recordLearningCycle,
  getFeedbackMetrics,
  resetFeedbackMetrics,
} from './feedback-metrics';

// Report
export {
  generateFeedbackReport,
  formatFeedbackReport,
  formatFeedbackReportJson,
  type FeedbackReport,
} from './feedback-report';
