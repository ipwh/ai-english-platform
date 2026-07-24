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
import { getOptimizationMetrics } from '@/modules/ai/optimization';
import { getPromptMetrics } from '@/modules/ai/prompt-intelligence';
import {
  getFeedbackMetrics, getFeedbackEventCount, detectPatterns,
  getKnowledgeState, getLearningHistory, generateFeedbackReport,
} from '@/modules/ai/prompt-intelligence/feedback';
import { getCalibrationMetrics } from '@/modules/ai/calibration';
import { getFairnessMetrics } from '@/modules/ai/fairness';
import { getQuestionQualityMetrics } from '@/modules/ai/question-quality';
import { getAdaptiveMetrics } from '@/modules/ai/adaptive';
import { getHumanReviewMetrics } from '@/modules/ai/human-review';

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
    optimization: getOptimizationMetrics(),
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
      metrics: getCalibrationMetrics(),
    },
    fairness: {
      metrics: getFairnessMetrics(),
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
  };
}
