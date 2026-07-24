// ============================================
// Sprint 109: Prompt Intelligence — Barrel Export
// ============================================

export type {
  PromptComponents, AssembledPrompt, PromptValidationResult,
  PromptConstraints, ReflectionResult, ReflectionCheck, OptimizationResult,
} from './prompt-types';
export { DEFAULT_CONSTRAINTS } from './prompt-types';

export { buildPrompt, estimatePromptComplexity } from './prompt-builder';
export { validatePrompt } from './prompt-optimizer';
export { optimizePrompt } from './prompt-optimizer';
export { reflectOnOutput } from './self-reflection';
export { generateReflectionReport, type ReflectionReport } from './reflection-report';
export {
  recordPromptBuilt, recordPromptOptimized, recordReflection,
  getPromptMetrics, getPromptHistory, resetPromptMetrics,
} from './prompt-metrics';

// Sprint 110: Adaptive Feedback
export {
  initFeedbackEngine, collectFeedback, collectAllFeedback, runFeedbackCycle,
  registerFeedbackCollector, getFeedbackCollector, getAllCollectors, hasCollector,
  unregisterCollector, getRegisteredSources, clearCollectorRegistry,
  recordFeedbackEvent, recordFeedbackEvents, getFeedbackHistory, getEventsBySource,
  getEventsByRule, getEventsByCategory, getFailureEvents, getRecentEvents,
  getEventsSince, countEventsBy, clearFeedbackHistory, getFeedbackEventCount,
  detectPatterns, detectPatternsForRule,
  upsertKnowledge, getKnowledge, findKnowledgeByRule, getAllKnowledge,
  getEnabledKnowledge, getKnowledgeByCategory, activateKnowledge, disableKnowledge,
  enableKnowledge, removeKnowledge, expireInactiveKnowledge, getDynamicConstraints,
  getKnowledgeState, clearKnowledge,
  runLearningCycle, getLearningHistory, clearLearningHistory,
  recordFeedbackCollected, recordFeedbackNormalized, recordLearningCycle,
  getFeedbackMetrics, resetFeedbackMetrics,
  generateFeedbackReport, formatFeedbackReport, formatFeedbackReportJson,
} from './feedback';
export type {
  FeedbackEvent, FeedbackSource, FeedbackSeverity, FeedbackCategory,
  DetectedPattern, PatternType, KnowledgeItem, KnowledgeState,
  DynamicConstraint, FeedbackSummary, LearningEvent,
  FeedbackCollector, FeedbackReport,
} from './feedback';
export { MAX_DYNAMIC_CONSTRAINTS, DEFAULT_ACTIVATION_THRESHOLD } from './feedback';
