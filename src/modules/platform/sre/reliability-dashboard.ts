// Sprint 98: Reliability Dashboard — combines all SRE metrics into one view
import type { PlatformReliabilityDashboard } from './slo-types';
import { evaluateAll } from './slo-manager';
import { getAllBudgets } from './error-budget';
import { computeReliabilityScore } from './reliability-score';
import { classifyIncidents } from './incident-classifier';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { getPerformanceBaselineReport } from '@/modules/ai/services/performance-baseline';
import { detectRegressions } from '@/modules/ai/runtime/regression-detector';
import { detectSaturation } from '@/modules/ai/runtime/saturation-detector';
import { getCapacityPlan } from '@/modules/ai/runtime/capacity-planner';
import { getEvaluationMetrics } from '@/modules/ai/evaluation';
import { getAssessmentMetrics } from '@/modules/ai/assessment';
import { getLayoutMetrics } from '@/modules/reading/layout';

// ============================================
// Stubs for deleted modules
// These modules (quality, prompt-intelligence, question-quality, adaptive,
// human-review, calibration, fairness, optimization) were speculative
// and never had runtime consumers. Stubs preserve the JSON structure
// of getFullRuntimeReport() for API consumers.
// ============================================

function getQualityMetricsStub() {
  return { totalQuestions: 0, avgScore: 0, scoreDistribution: {}, dimensionScores: {}, trendData: [] };
}
function getRepairMetricsStub() { return { totalRepairs: 0, successRate: 0, avgLatencyMs: 0 }; }
function getRepairHistoryStub(_limit?: number) { return []; }
function getPromptMetricsStub() {
  return { totalPrompts: 0, avgLatencyMs: 0, avgTokens: 0, responseCount: 0, errorRate: 0, cacheHitRate: 0, promptVersionDistribution: {} };
}
function getFeedbackMetricsStub() { return { totalFeedback: 0, positiveRate: 0, negativeRate: 0, avgRating: 0 }; }
function getFeedbackEventCountStub() { return 0; }
function detectPatternsStub() { return []; }
function getKnowledgeStateStub() { return {}; }
function getLearningHistoryStub(_limit?: number) { return []; }
function getQuestionQualityMetricsStub() { return { totalQuestions: 0, approved: 0, warned: 0, rejected: 0, repaired: 0, avgScore: 0 }; }
function getAdaptiveMetricsStub() { return { totalSessions: 0, avgMasteryGain: 0, recommendationAccuracy: 0 }; }
function getHumanReviewMetricsStub() { return { totalReviews: 0, pending: 0, approved: 0, rejected: 0, avgReviewTimeMs: 0 }; }

function getCalibrationMetricsStub() {
  return {
    totalCalibrations: 0, totalQuestions: 0,
    avgCalibrationScore: 0, avgAnswerLength: 0, avgExplanationLength: 0,
    totalChanges: 0, mostCommonRule: null,
    improvementRate: 0, ruleStatistics: [],
  };
}

function getFairnessMetricsStub() {
  return {
    totalEvaluations: 0, avgScore: 0, avgConfidence: 0,
    correctRate: 0, acceptRate: 0, partialRate: 0, incorrectRate: 0,
    falseNegativeReduction: 100, partialCreditFrequency: 0,
    mostTriggeredRule: null, ruleStatistics: [],
  };
}

function getOptimizationMetricsStub() {
  return {
    totalEvaluations: 0, approved: 0, warned: 0, optimized: 0,
    regenLater: 0, rejected: 0, repairs: 0,
    avgScore: 0, avgLatencyMs: 0,
    ruleStats: [], topOptimizations: [],
  };
}

export function getReliabilityDashboard(): PlatformReliabilityDashboard {
  const reliability = computeReliabilityScore();
  const slo = evaluateAll();
  const errorBudget = getAllBudgets();
  const incidents = classifyIncidents();

  const summary = `Reliability: ${reliability.grade} (${reliability.score}/100) | ` +
    `SLO: ${slo.overallStatus} | ` +
    `Incidents: ${incidents.active.length} active | ` +
    `Error Budget: ${errorBudget.length > 0 ? errorBudget[0].monthly.percentage + '%' : 'N/A'} remaining`;

  return { timestamp: new Date().toISOString(), reliability, slo, errorBudget, incidents, summary };
}

/** Extended runtime metrics with all SRE data */
export function getFullRuntimeReport() {
  return {
    performance: getRuntimeMetrics(),
    baseline: getPerformanceBaselineReport(),
    regressions: detectRegressions(),
    capacity: getCapacityPlan(),
    saturation: detectSaturation(),
    load: { status: 'available', cli: 'npm run load:test' },
    benchmarks: { status: 'available', cli: 'npm run benchmark:ai' },
    reliability: computeReliabilityScore(),
    slo: evaluateAll(),
    errorBudget: getAllBudgets(),
    incidents: classifyIncidents(),
    dashboard: getReliabilityDashboard(),
    quality: getQualityMetricsStub(),
    repair: {
      metrics: getRepairMetricsStub(),
      history: getRepairHistoryStub(20),
    },
    evaluation: getEvaluationMetrics(),
    assessment: getAssessmentMetrics(),
    optimization: getOptimizationMetricsStub(),
    promptIntelligence: getPromptMetricsStub(),
    feedback: {
      metrics: getFeedbackMetricsStub(),
      history: getFeedbackEventCountStub(),
      patterns: detectPatternsStub().length,
      knowledge: getKnowledgeStateStub(),
      learning: getLearningHistoryStub(20),
      report: 'available (generateFeedbackReportStub)',
    },
    calibration: {
      metrics: getCalibrationMetricsStub(),
    },
    fairness: {
      metrics: getFairnessMetricsStub(),
    },
    questionQuality: {
      metrics: getQuestionQualityMetricsStub(),
    },
    adaptive: {
      metrics: getAdaptiveMetricsStub(),
    },
    humanReview: {
      metrics: getHumanReviewMetricsStub(),
    },
    readingLayout: {
      metrics: getLayoutMetrics(),
    },
  };
}
