// ============================================
// Sprint 110: Feedback Metrics
// Tracks all feedback operations, patterns, and learning.
// ============================================

import type { FeedbackSource, FeedbackCategory, FeedbackSeverity } from './feedback-types';
import { getFeedbackEventCount, getFeedbackHistory } from './feedback-history';
import { getAllKnowledge, getKnowledgeState } from './feedback-knowledge';
import { getLearningHistory } from './feedback-learning';
import { detectPatterns } from './feedback-pattern';

interface FeedbackMetricState {
  totalCollectedBySource: Record<string, number>;
  totalNormalized: number;
  normalizedBySource: Record<string, number>;
  normalizedByCategory: Record<string, number>;
  normalizedBySeverity: Record<string, number>;
  learningCycles: number;
  totalPatternsDetected: number;
  totalKnowledgeCreated: number;
  totalKnowledgeUpdated: number;
}

const state: FeedbackMetricState = {
  totalCollectedBySource: {},
  totalNormalized: 0,
  normalizedBySource: {},
  normalizedByCategory: {},
  normalizedBySeverity: {},
  learningCycles: 0,
  totalPatternsDetected: 0,
  totalKnowledgeCreated: 0,
  totalKnowledgeUpdated: 0,
};

/** Record feedback collected from a source */
export function recordFeedbackCollected(source: FeedbackSource, count: number): void {
  state.totalCollectedBySource[source] = (state.totalCollectedBySource[source] || 0) + count;
}

/** Record feedback normalized */
export function recordFeedbackNormalized(source: FeedbackSource, category: FeedbackCategory, severity: FeedbackSeverity): void {
  state.totalNormalized++;
  state.normalizedBySource[source] = (state.normalizedBySource[source] || 0) + 1;
  state.normalizedByCategory[category] = (state.normalizedByCategory[category] || 0) + 1;
  state.normalizedBySeverity[severity] = (state.normalizedBySeverity[severity] || 0) + 1;
}

/** Record a learning cycle */
export function recordLearningCycle(patternsDetected: number, knowledgeCreated: number, knowledgeUpdated: number): void {
  state.learningCycles++;
  state.totalPatternsDetected += patternsDetected;
  state.totalKnowledgeCreated += knowledgeCreated;
  state.totalKnowledgeUpdated += knowledgeUpdated;
}

/** Get comprehensive feedback metrics */
export function getFeedbackMetrics() {
  const knowledgeState = getKnowledgeState();
  const events = getFeedbackHistory();
  const patterns = detectPatterns();

  // Top failing rules
  const ruleCounts = new Map<string, number>();
  for (const e of events) {
    ruleCounts.set(e.rule, (ruleCounts.get(e.rule) || 0) + 1);
  }
  const topFailingRules = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));

  // Top constraints
  const knowledge = getAllKnowledge();
  const topConstraints = knowledge
    .filter(k => k.enabled && k.activationCount > 0)
    .sort((a, b) => b.activationCount - a.activationCount)
    .slice(0, 10)
    .map(k => ({ text: k.constraint, activations: k.activationCount, confidence: k.confidence }));

  // Average learning latency (events between pattern detection and knowledge creation)
  const learningHistory = getLearningHistory();
  const avgLearningLatency = learningHistory.length > 0
    ? Math.round(state.learningCycles > 0 ? events.length / state.learningCycles : 0)
    : 0;

  // Improvement rates (if we have enough data)
  const recentEvents = events.slice(-200);
  const olderEvents = events.slice(-400, -200);
  const recentFailRate = recentEvents.length > 0
    ? recentEvents.filter(e => e.severity !== 'info').length / recentEvents.length
    : 0;
  const olderFailRate = olderEvents.length > 0
    ? olderEvents.filter(e => e.severity !== 'info').length / olderEvents.length
    : recentFailRate;
  const improvementRate = olderFailRate > 0
    ? Math.round((olderFailRate - recentFailRate) / olderFailRate * 100)
    : 0;

  // Repair reduction
  const recentRepairs = recentEvents.filter(e => e.repairable).length;
  const olderRepairs = olderEvents.filter(e => e.repairable).length;
  const repairReductionRate = olderRepairs > 0
    ? Math.round((olderRepairs - recentRepairs) / olderRepairs * 100)
    : 0;

  return {
    // Feedback counts
    totalEvents: getFeedbackEventCount(),
    eventsBySource: { ...state.totalCollectedBySource },
    eventsNormalized: state.totalNormalized,
    normalizedByCategory: { ...state.normalizedByCategory },
    normalizedBySeverity: { ...state.normalizedBySeverity },

    // Top items
    topFailingRules,
    topConstraints,

    // Patterns
    patternCount: patterns.length,

    // Knowledge
    knowledgeCount: knowledgeState.totalCount,
    knowledgeEnabled: knowledgeState.enabledCount,
    knowledgeActivations: knowledgeState.totalActivations,
    averageKnowledgeConfidence: knowledgeState.averageConfidence,

    // Learning
    learningCycles: state.learningCycles,
    avgLearningLatency,
    totalPatternsDetected: state.totalPatternsDetected,
    totalKnowledgeCreated: state.totalKnowledgeCreated,
    totalKnowledgeUpdated: state.totalKnowledgeUpdated,

    // Improvement rates
    promptImprovementRate: improvementRate,
    repairReductionRate,
    assessmentImprovement: improvementRate, // proxy
    qualityImprovement: improvementRate,    // proxy
  };
}

/** Reset all feedback metrics */
export function resetFeedbackMetrics(): void {
  state.totalCollectedBySource = {};
  state.totalNormalized = 0;
  state.normalizedBySource = {};
  state.normalizedByCategory = {};
  state.normalizedBySeverity = {};
  state.learningCycles = 0;
  state.totalPatternsDetected = 0;
  state.totalKnowledgeCreated = 0;
  state.totalKnowledgeUpdated = 0;
}
