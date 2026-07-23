// Sprint 65: Evidence-Based Learning — canonical types
// Evidence is computed ONLY from StudentState snapshots, never from raw repositories.
// LLM may NEVER compute effectiveness. Only EvidenceEvaluationService may.

import type { LearningDecision } from './LearningDecision';
import type { StudentState } from '@/modules/student/state/StudentState';

// ============================================
// LearningEvidence — objective before/after comparison
// ============================================

export interface LearningEvidence {
  decisionId: string;
  studentId: string;
  createdAt: string;

  /** Snapshot BEFORE the learning activity */
  baseline: {
    mastery: number;
    mistakeCount: number;
    retention: number;
    confidence: number;
  };

  /** Snapshot AFTER the learning activity */
  outcome: {
    mastery: number;
    mistakeCount: number;
    retention: number;
    confidence: number;
  };

  /** Computed deltas */
  delta: {
    mastery: number;      // positive = improvement
    mistakes: number;     // negative = reduction (good)
    retention: number;    // positive = improvement
  };

  /** What the decision predicted */
  expectedGain: number;

  /** What actually happened */
  actualGain: number;

  /** How effective was this decision (0-1) */
  effectiveness: number;

  /** Was the evidence successfully collected? */
  verified: boolean;
}

// ============================================
// LearningOutcome — did the recommendation work?
// ============================================

export interface LearningOutcome {
  decisionId: string;
  successful: boolean;
  achievedExpectedGain: boolean;
  gainPercentage: number;        // actualGain / expectedGain * 100
  recommendationAccuracy: number; // 0-1
  evidence: LearningEvidence;
}

// ============================================
// EvidenceTimeline — accumulated history
// ============================================

export interface EvidenceTimeline {
  studentId: string;
  decisions: Array<{
    decision: LearningDecision;
    outcome: LearningOutcome;
    timestamp: string;
  }>;
  /** Aggregated metrics over time */
  aggregate: {
    totalDecisions: number;
    successfulDecisions: number;
    averageEffectiveness: number;
    averageGain: number;
    averageAccuracy: number;
    trend: 'improving' | 'stable' | 'declining';
    mostEffectiveAction: string;
    leastEffectiveAction: string;
  };
}

// ============================================
// Builders
// ============================================

/** Generate a decision ID from studentId + skill + timestamp */
export function generateDecisionId(studentId: string, skill: string): string {
  return `${studentId}:${skill}:${Date.now()}`;
}

/** Extract baseline mastery snapshot from StudentState for a given skill */
export function extractBaseline(state: StudentState, skill: string): LearningEvidence['baseline'] {
  const skillData = state.mastery.bySkill[skill];
  return {
    mastery: skillData?.score ?? state.mastery.overallScore,
    mistakeCount: skillData?.mistakeCount ?? 0,
    retention: state.knowledge.retentionRate,
    confidence: state.confidence.perSkill[skill] ?? state.confidence.overallConfidence,
  };
}

/** Extract outcome mastery snapshot from StudentState for a given skill */
export function extractOutcome(state: StudentState, skill: string): LearningEvidence['outcome'] {
  const skillData = state.mastery.bySkill[skill];
  return {
    mastery: skillData?.score ?? state.mastery.overallScore,
    mistakeCount: skillData?.mistakeCount ?? 0,
    retention: state.knowledge.retentionRate,
    confidence: state.confidence.perSkill[skill] ?? state.confidence.overallConfidence,
  };
}
