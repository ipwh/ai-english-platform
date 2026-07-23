// Sprint 65: EvidenceEvaluationService — the ONLY component allowed to evaluate learning effectiveness
// Rules:
// - NO repository imports. NO Prisma. NO db. NO adminDbQuery.
// - Input: StudentState snapshots (before/after) + LearningDecision
// - Output: LearningEvidence + LearningOutcome (pure computation)
// - LLM may NEVER compute: effectiveness, confidence, mastery gain, accuracy

import type { StudentState } from '@/modules/student/state/StudentState';
import type { LearningDecision } from './LearningDecision';
import type { LearningEvidence, LearningOutcome, EvidenceTimeline } from './LearningEvidence';
import { extractBaseline, extractOutcome } from './LearningEvidence';

// ============================================
// EvidenceEvaluationService
// ============================================

export class EvidenceEvaluationService {

  /**
   * Evaluate a single learning decision by comparing before/after StudentState snapshots.
   * Returns complete evidence + outcome assessment.
   */
  evaluate(
    decision: LearningDecision,
    before: StudentState,
    after: StudentState,
  ): LearningOutcome {
    const skill = decision.targetSkill;
    const baseline = extractBaseline(before, skill);
    const outcome = extractOutcome(after, skill);

    // Compute deltas
    const masteryDelta = outcome.mastery - baseline.mastery;
    const mistakeDelta = outcome.mistakeCount - baseline.mistakeCount;
    const retentionDelta = outcome.retention - baseline.retention;

    // Actual gain (capped at 0 minimum, no negative gain)
    const actualGain = Math.max(0, masteryDelta);
    const expectedGain = decision.expectedGain;

    // Effectiveness: ratio of actual to expected (capped at 1.0)
    const effectiveness = expectedGain > 0
      ? Math.min(1, actualGain / expectedGain)
      : (actualGain > 0 ? 1 : 0);

    // Recommendation accuracy: how close was the prediction?
    const recommendationAccuracy = expectedGain > 0
      ? 1 - Math.min(1, Math.abs(expectedGain - actualGain) / expectedGain)
      : (actualGain === 0 ? 1 : 0);

    const evidence: LearningEvidence = {
      decisionId: `${decision.targetSkill}:${Date.now()}`,
      studentId: before.identity.id,
      createdAt: new Date().toISOString(),
      baseline,
      outcome,
      delta: {
        mastery: Math.round(masteryDelta * 100) / 100,
        mistakes: Math.round(mistakeDelta),
        retention: Math.round(retentionDelta * 100) / 100,
      },
      expectedGain,
      actualGain: Math.round(actualGain * 100) / 100,
      effectiveness: Math.round(effectiveness * 100) / 100,
      verified: true,
    };

    const gainPercentage = expectedGain > 0
      ? Math.round((actualGain / expectedGain) * 100)
      : (actualGain > 0 ? 100 : 0);

    return {
      decisionId: evidence.decisionId,
      successful: actualGain > 0,
      achievedExpectedGain: actualGain >= expectedGain * 0.5, // 50% threshold
      gainPercentage,
      recommendationAccuracy: Math.round(recommendationAccuracy * 100) / 100,
      evidence,
    };
  }

  /**
   * Evaluate multiple decisions from a single before/after snapshot pair.
   */
  evaluateAll(
    decisions: LearningDecision[],
    before: StudentState,
    after: StudentState,
  ): LearningOutcome[] {
    return decisions.map(d => this.evaluate(d, before, after));
  }

  /**
   * Build an evidence timeline from a history of decisions and outcomes.
   */
  buildTimeline(
    studentId: string,
    history: Array<{ decision: LearningDecision; before: StudentState; after: StudentState }>,
  ): EvidenceTimeline {
    const entries = history.map(({ decision, before, after }) => {
      const outcome = this.evaluate(decision, before, after);
      return {
        decision,
        outcome,
        timestamp: outcome.evidence.createdAt,
      };
    });

    const outcomes = entries.map(e => e.outcome);
    const successful = outcomes.filter(o => o.successful);

    // Determine trend from last 5 outcomes
    const recent = outcomes.slice(-5);
    const recentEffectiveness = recent.map(o => o.evidence.effectiveness);
    const trend: EvidenceTimeline['aggregate']['trend'] =
      recentEffectiveness.length < 2 ? 'stable' :
      recentEffectiveness[recentEffectiveness.length - 1] > recentEffectiveness[0] ? 'improving' :
      recentEffectiveness[recentEffectiveness.length - 1] < recentEffectiveness[0] ? 'declining' : 'stable';

    // Most/least effective action types
    const byAction = new Map<string, number[]>();
    for (const e of entries) {
      const action = e.decision.action;
      if (!byAction.has(action)) byAction.set(action, []);
      byAction.get(action)!.push(e.outcome.evidence.effectiveness);
    }
    let mostEffectiveAction = '';
    let leastEffectiveAction = '';
    let bestAvg = 0;
    let worstAvg = 1;
    for (const [action, scores] of byAction) {
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      if (avg > bestAvg) { bestAvg = avg; mostEffectiveAction = action; }
      if (avg < worstAvg) { worstAvg = avg; leastEffectiveAction = action; }
    }

    return {
      studentId,
      decisions: entries,
      aggregate: {
        totalDecisions: entries.length,
        successfulDecisions: successful.length,
        averageEffectiveness: outcomes.length > 0
          ? Math.round(outcomes.reduce((s, o) => s + o.evidence.effectiveness, 0) / outcomes.length * 100) / 100
          : 0,
        averageGain: outcomes.length > 0
          ? Math.round(outcomes.reduce((s, o) => s + o.evidence.actualGain, 0) / outcomes.length * 100) / 100
          : 0,
        averageAccuracy: outcomes.length > 0
          ? Math.round(outcomes.reduce((s, o) => s + o.recommendationAccuracy, 0) / outcomes.length * 100) / 100
          : 0,
        trend,
        mostEffectiveAction,
        leastEffectiveAction,
      },
    };
  }

  /**
   * Compute effectiveness summary for teacher dashboard.
   * Answers: Which recommendations worked? Which didn't? Average gain? Best intervention?
   */
  summarizeForTeacher(timeline: EvidenceTimeline) {
    const { aggregate, decisions } = timeline;

    return {
      summary: {
        totalDecisions: aggregate.totalDecisions,
        successRate: aggregate.totalDecisions > 0
          ? Math.round((aggregate.successfulDecisions / aggregate.totalDecisions) * 100)
          : 0,
        averageGain: aggregate.averageGain,
        averageAccuracy: aggregate.averageAccuracy,
        trend: aggregate.trend,
      },
      topPerforming: decisions
        .filter(d => d.outcome.successful)
        .sort((a, b) => b.outcome.evidence.effectiveness - a.outcome.evidence.effectiveness)
        .slice(0, 5)
        .map(d => ({
          skill: d.decision.targetSkill,
          skillZh: d.decision.targetSkillZh,
          action: d.decision.action,
          expectedGain: d.outcome.evidence.expectedGain,
          actualGain: d.outcome.evidence.actualGain,
          effectiveness: d.outcome.evidence.effectiveness,
        })),
      worstPerforming: decisions
        .filter(d => !d.outcome.successful)
        .sort((a, b) => a.outcome.evidence.effectiveness - b.outcome.evidence.effectiveness)
        .slice(0, 5)
        .map(d => ({
          skill: d.decision.targetSkill,
          skillZh: d.decision.targetSkillZh,
          action: d.decision.action,
          expectedGain: d.outcome.evidence.expectedGain,
          actualGain: d.outcome.evidence.actualGain,
          effectiveness: d.outcome.evidence.effectiveness,
        })),
      mostEffectiveAction: aggregate.mostEffectiveAction,
      leastEffectiveAction: aggregate.leastEffectiveAction,
      averageMasteryImprovement: aggregate.averageGain,
    };
  }
}

export const evidenceEvaluationService = new EvidenceEvaluationService();
