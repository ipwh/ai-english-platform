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
import { getQualityMetrics } from '@/modules/ai/quality';
import { getRepairMetrics, getRepairHistory } from '@/modules/ai/quality/repair';
import { getEvaluationMetrics } from '@/modules/ai/evaluation';
import { getAssessmentMetrics } from '@/modules/ai/assessment';
import { getPromptMetrics } from '@/modules/ai/prompt-intelligence';
import {
  getFeedbackMetrics, getFeedbackEventCount, detectPatterns,
  getKnowledgeState, getLearningHistory, generateFeedbackReport,
} from '@/modules/ai/prompt-intelligence/feedback';
import { getQuestionQualityMetrics } from '@/modules/ai/question-quality';
import { getAdaptiveMetrics } from '@/modules/ai/adaptive';
import { getHumanReviewMetrics } from '@/modules/ai/human-review';
import { getLayoutMetrics } from '@/modules/reading/layout';

// ============================================
// Stubs for deprecated modules (calibration, fairness, optimization)
// These modules are not used in runtime AI pipelines for single-school deployment.
// Stubs preserve the JSON structure of getFullRuntimeReport() for API consumers.
// ============================================

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
    quality: getQualityMetrics(),
    repair: {
      metrics: getRepairMetrics(),
      history: getRepairHistory(20),
    },
    evaluation: getEvaluationMetrics(),
    assessment: getAssessmentMetrics(),
    optimization: getOptimizationMetricsStub(),
    promptIntelligence: getPromptMetrics(),
    feedback: {
      metrics: getFeedbackMetrics(),
      history: getFeedbackEventCount(),
      patterns: detectPatterns().length,
      knowledge: getKnowledgeState(),
      learning: getLearningHistory(20),
      report: 'available (generateFeedbackReport)',
    },
    calibration: {
      metrics: getCalibrationMetricsStub(),
    },
    fairness: {
      metrics: getFairnessMetricsStub(),
    },
    questionQuality: {
      metrics: getQuestionQualityMetrics(),
    },
    adaptive: {
      metrics: getAdaptiveMetrics(),
    },
    humanReview: {
      metrics: getHumanReviewMetrics(),
    },
    readingLayout: {
      metrics: getLayoutMetrics(),
    },
  };
}
