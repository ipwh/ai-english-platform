// ============================================
// Sprint 110: Feedback Engine
// Central coordinator: collect → normalize → store → learn.
// ============================================

import type { FeedbackEvent, FeedbackSource, FeedbackCategory, FeedbackSeverity } from './feedback-types';
import { recordFeedbackEvent, getFeedbackHistory, getRecentEvents, countEventsBy } from './feedback-history';
import { registerFeedbackCollector, getAllCollectors, type FeedbackCollector } from './feedback-registry';
import { detectPatterns } from './feedback-pattern';
import { getDynamicConstraints } from './feedback-knowledge';
import { runLearningCycle } from './feedback-learning';
import {
  recordFeedbackCollected, recordFeedbackNormalized,
  recordLearningCycle, getFeedbackMetrics as getMetrics,
} from './feedback-metrics';

// ═══ Default Collectors ═══

/** Collect feedback from quality results */
const qualityCollector: FeedbackCollector = {
  source: 'quality',
  collect(result: unknown) {
    const r = result as Record<string, unknown>;
    if (!r || !r.checks) return [];
    const checks = r.checks as Array<Record<string, unknown>>;
    return checks
      .filter(c => !c.passed)
      .map(c => ({
        source: 'quality' as FeedbackSource,
        rule: String(c.ruleId || 'unknown'),
        ruleName: String(c.ruleName || ''),
        severity: mapPriorityToSeverity(String(c.priority || 'medium')),
        category: mapRuleToCategory(String(c.ruleId || '')),
        dimension: String(c.dimension || ''),
        repairable: Boolean(c.repairable),
        score: typeof c.score === 'number' ? Math.round(c.score * 100) : undefined,
      }));
  },
};

/** Collect feedback from repair results */
const repairCollector: FeedbackCollector = {
  source: 'repair',
  collect(result: unknown) {
    const r = result as Record<string, unknown>;
    if (!r) return [];
    const events: Omit<FeedbackEvent, 'id' | 'timestamp'>[] = [];

    // From repair pipeline result
    if (r.results && Array.isArray(r.results)) {
      for (const step of r.results as Array<Record<string, unknown>>) {
        if (!step.success) {
          events.push({
            source: 'repair',
            rule: String(step.ruleId || 'unknown'),
            severity: 'error',
            category: 'structure',
            repairable: true,
            durationMs: typeof step.durationMs === 'number' ? step.durationMs : undefined,
          });
        }
      }
    }

    // From single repair result
    if (r.ruleId && !r.success) {
      events.push({
        source: 'repair',
        rule: String(r.ruleId),
        severity: 'error',
        category: 'structure',
        repairable: true,
      });
    }

    return events;
  },
};

/** Collect feedback from evaluation results */
const evaluationCollector: FeedbackCollector = {
  source: 'evaluation',
  collect(result: unknown) {
    const r = result as Record<string, unknown>;
    if (!r) return [];
    const events: Omit<FeedbackEvent, 'id' | 'timestamp'>[] = [];

    const decision = String(r.decision || r.gradingDecision || '');
    const score = typeof r.score === 'number' ? r.score : typeof r.overallScore === 'number' ? r.overallScore : undefined;

    if (decision === 'incorrect' || (score !== undefined && score < 50)) {
      events.push({
        source: 'evaluation',
        rule: 'eval:overall',
        severity: score !== undefined && score < 30 ? 'critical' : 'warning',
        category: 'assessment',
        score,
        repairable: false,
      });
    }

    // Per-rule results
    if (r.ruleResults && Array.isArray(r.ruleResults)) {
      for (const rr of r.ruleResults as Array<Record<string, unknown>>) {
        if (!rr.passed) {
          events.push({
            source: 'evaluation',
            rule: String(rr.ruleId || 'unknown'),
            severity: 'warning',
            category: 'answer',
            score: typeof rr.score === 'number' ? Math.round(rr.score * 100) : undefined,
            repairable: false,
          });
        }
      }
    }

    return events;
  },
};

/** Collect feedback from assessment results */
const assessmentCollector: FeedbackCollector = {
  source: 'assessment',
  collect(result: unknown) {
    const r = result as Record<string, unknown>;
    if (!r || !r.checks) return [];
    const checks = r.checks as Array<Record<string, unknown>>;
    return checks
      .filter(c => !c.passed)
      .map(c => ({
        source: 'assessment' as FeedbackSource,
        rule: String(c.ruleId || 'unknown'),
        severity: mapPriorityToSeverity(String(c.priority || 'medium')),
        category: mapAssessmentRuleToCategory(String(c.ruleId || '')),
        dimension: String(c.dimension || ''),
        score: typeof c.score === 'number' ? Math.round(c.score * 100) : undefined,
        repairable: typeof c.estimatedRepairCost === 'number' && c.estimatedRepairCost < 80,
      }));
  },
};

/** Collect feedback from optimization results */
const optimizationCollector: FeedbackCollector = {
  source: 'optimization',
  collect(result: unknown) {
    const r = result as Record<string, unknown>;
    if (!r || !r.checks) return [];
    const checks = r.checks as Array<Record<string, unknown>>;
    return checks
      .filter(c => !c.passed)
      .map(c => ({
        source: 'optimization' as FeedbackSource,
        rule: String(c.ruleId || 'unknown'),
        severity: mapPriorityToSeverity(String(c.priority || 'medium')),
        category: 'readability' as FeedbackCategory,
        repairable: c.action === 'repair' || c.action === 'normalize',
        score: typeof c.score === 'number' ? Math.round(c.score * 100) : undefined,
      }));
  },
};

/** Collect feedback from self-reflection results */
const reflectionCollector: FeedbackCollector = {
  source: 'self-reflection',
  collect(result: unknown) {
    const r = result as Record<string, unknown>;
    if (!r || !r.checks) return [];
    const checks = r.checks as Array<Record<string, unknown>>;
    const score = typeof r.score === 'number' ? r.score : undefined;

    return checks
      .filter(c => !c.passed)
      .map(c => ({
        source: 'self-reflection' as FeedbackSource,
        rule: `ref:${String(c.name || 'unknown')}`,
        severity: 'warning' as FeedbackSeverity,
        category: 'structure' as FeedbackCategory,
        score,
        repairable: true,
      }));
  },
};

// ═══ Engine ═══

/** Initialize the feedback engine: register all default collectors */
export function initFeedbackEngine(): void {
  registerFeedbackCollector(qualityCollector);
  registerFeedbackCollector(repairCollector);
  registerFeedbackCollector(evaluationCollector);
  registerFeedbackCollector(assessmentCollector);
  registerFeedbackCollector(optimizationCollector);
  registerFeedbackCollector(reflectionCollector);
}

/** Collect feedback from a layer result */
export function collectFeedback(source: FeedbackSource, result: unknown): FeedbackEvent[] {
  const collector = getAllCollectors().find(c => c.source === source);
  if (!collector) {
    // Auto-register if not already registered
    initFeedbackEngine();
    const fallback = getAllCollectors().find(c => c.source === source);
    if (!fallback) return [];
    const rawEvents = fallback.collect(result);
    recordFeedbackCollected(source, rawEvents.length);
    const events: FeedbackEvent[] = [];
    for (const event of rawEvents) {
      const recorded = recordFeedbackEvent(event);
      recordFeedbackNormalized(event.source, event.category, event.severity);
      events.push(recorded);
    }
    return events;
  }

  const rawEvents = collector.collect(result);
  recordFeedbackCollected(source, rawEvents.length);
  const events: FeedbackEvent[] = [];
  for (const event of rawEvents) {
    const recorded = recordFeedbackEvent(event);
    recordFeedbackNormalized(event.source, event.category, event.severity);
    events.push(recorded);
  }
  return events;
}

/** Collect feedback from all layers after a full pipeline run */
export function collectAllFeedback(results: Record<FeedbackSource, unknown>): FeedbackEvent[] {
  const allEvents: FeedbackEvent[] = [];
  for (const [source, result] of Object.entries(results) as [FeedbackSource, unknown][]) {
    const events = collectFeedback(source, result);
    allEvents.push(...events);
  }
  return allEvents;
}

/** Run a full feedback cycle: collect patterns, learn, return dynamic constraints */
export function runFeedbackCycle(results?: Record<FeedbackSource, unknown>): {
  events: FeedbackEvent[];
  constraints: Array<{ text: string; priority: number; confidence: number; activationCount: number }>;
  learningResult: ReturnType<typeof runLearningCycle>;
} {
  // Collect if results provided
  if (results) {
    collectAllFeedback(results);
  }

  // Run learning cycle
  const learningResult = runLearningCycle({ autoExpire: true });
  recordLearningCycle(
    learningResult.patternsDetected,
    learningResult.knowledgeCreated,
    learningResult.knowledgeUpdated,
  );

  // Get dynamic constraints
  const constraints = getDynamicConstraints();

  return {
    events: getRecentEvents(100),
    constraints,
    learningResult,
  };
}

// ═══ Helpers ═══

function mapPriorityToSeverity(priority: string): FeedbackSeverity {
  switch (priority) {
    case 'critical': return 'critical';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'info';
    default: return 'warning';
  }
}

function mapRuleToCategory(ruleId: string): FeedbackCategory {
  if (ruleId.includes('answer') || ruleId.includes('mcq-answer')) return 'answer';
  if (ruleId.includes('explanation')) return 'explanation';
  if (ruleId.includes('option') || ruleId.includes('choice') || ruleId.includes('distractor')) return 'options';
  if (ruleId.includes('reading')) return 'content';
  if (ruleId.includes('listening')) return 'content';
  if (ruleId.includes('writing')) return 'content';
  if (ruleId.includes('field') || ruleId.includes('presence')) return 'structure';
  if (ruleId.includes('consistency')) return 'consistency';
  if (ruleId.includes('difficulty')) return 'difficulty';
  return 'structure';
}

function mapAssessmentRuleToCategory(ruleId: string): FeedbackCategory {
  if (ruleId.includes('mcq') || ruleId.includes('distractor') || ruleId.includes('option')) return 'options';
  if (ruleId.includes('difficulty') || ruleId.includes('vocabulary')) return 'difficulty';
  if (ruleId.includes('passage') || ruleId.includes('listening')) return 'content';
  if (ruleId.includes('writing')) return 'prompt';
  if (ruleId.includes('grammar')) return 'structure';
  if (ruleId.includes('clarity')) return 'readability';
  return 'assessment';
}
