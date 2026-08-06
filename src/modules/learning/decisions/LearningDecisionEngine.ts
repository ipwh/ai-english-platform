// Sprint 64: LearningDecisionEngine — the ONLY component allowed to compute learning decisions
// Merges: recommendation-engine + learning-engine + dse-adaptive-path
// Input: StudentState (canonical). NO repository imports. NO Prisma. NO db.
// Output: LearningDecision[] — fully explainable, bilingual, deterministic.

import type { StudentState } from '@/modules/student/state/StudentState';
import {
  DECISION_WEIGHTS, getCanonicalDSEWeight,
  createLearningDecision, CANONICAL_DSE_WEIGHTS,
} from './LearningDecision';
import { skillLabelZh } from '@/shared/utils/skill-labels';
import type { LearningDecision } from './LearningDecision';

// ============================================
// LearningDecisionEngine
// ============================================

export class LearningDecisionEngine {

  /**
   * Generate ALL learning decisions for a student from canonical StudentState.
   * This is the ONLY entry point for priority computation.
   */
  decideAll(state: StudentState): LearningDecision[] {
    const decisions: LearningDecision[] = [];

    // 1. Grammar decisions — from mastery bySkill
    for (const [skill, data] of Object.entries(state.mastery.bySkill)) {
      const dseWeight = getCanonicalDSEWeight(skill);
      if (dseWeight === 0.40 && !CANONICAL_DSE_WEIGHTS[skill]) continue; // skip unknown skills

      const weaknessScore = 1 - data.score / 100;
      const recencyScore = Math.min(1, (state.practice.totalSessions === 0 ? 30 : 7) / 30);
      const readinessScore = state.knowledge.retentionRate;

      const priority =
        weaknessScore * DECISION_WEIGHTS.WEAKNESS +
        dseWeight * DECISION_WEIGHTS.EXAM_IMPORTANCE +
        readinessScore * DECISION_WEIGHTS.READINESS +
        recencyScore * DECISION_WEIGHTS.RECENCY;

      const masteryZh = skillLabelZh(skill);
      decisions.push(createLearningDecision({
        targetSkill: skill,
        targetSkillZh: masteryZh,
        masteryBefore: data.score,
        mistakeCount: data.mistakeCount,
        daysSinceLastPractice: data.practiceCount === 0 ? 30 : 7,
        priorityScore: priority,
      }));
    }

    // 2. Weakness-based decisions (from weakness profile)
    if (state.weakness) {
      for (const w of state.weakness.topWeaknesses.slice(0, 10)) {
        const dseWeight = getCanonicalDSEWeight(w.name);
        const weaknessScore = 1 - w.accuracy / 100;
        const priority =
          weaknessScore * DECISION_WEIGHTS.WEAKNESS +
          dseWeight * DECISION_WEIGHTS.EXAM_IMPORTANCE +
          0.5 * DECISION_WEIGHTS.READINESS +
          0.5 * DECISION_WEIGHTS.RECENCY;

        const name = w.nameZh || w.name;
        decisions.push(createLearningDecision({
          targetSkill: w.name,
          targetSkillZh: name,
          masteryBefore: w.accuracy,
          mistakeCount: w.frequency,
          daysSinceLastPractice: 3,
          priorityScore: priority,
        }));
      }
    }

    // 3. Vocabulary decision
    if (state.vocabulary) {
      const vocabPriority =
        (1 - Math.min(1, (state.vocabulary.reviewQueue || 0) / 20)) * DECISION_WEIGHTS.WEAKNESS +
        0.50 * DECISION_WEIGHTS.EXAM_IMPORTANCE +
        0.6 * DECISION_WEIGHTS.READINESS +
        0.5 * DECISION_WEIGHTS.RECENCY;

      decisions.push(createLearningDecision({
        targetSkill: 'vocabulary',
        targetSkillZh: '詞彙',
        masteryBefore: Math.round((state.vocabulary.total > 0
          ? Object.entries(state.vocabulary.byStatus)
            .filter(([k]) => ['known','mastered'].includes(k))
            .reduce((s, [, v]) => s + v, 0) / Math.max(1, state.vocabulary.total) * 100
          : 50)),
        mistakeCount: state.vocabulary.reviewQueue,
        daysSinceLastPractice: 3,
        priorityScore: vocabPriority,
      }));
    }

    // 4. Deduplicate and sort by priority descending
    const seen = new Set<string>();
    const unique = decisions.filter(d => {
      const key = `${d.targetSkill}|${d.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => b.priority - a.priority);

    // 5. Diagnostic check: if very few decisions, add diagnostic
    if (unique.length < 3) {
      unique.push(createLearningDecision({
        targetSkill: 'diagnostic',
        targetSkillZh: '診斷測驗',
        masteryBefore: state.mastery.overallScore,
        mistakeCount: 0,
        daysSinceLastPractice: state.practice.totalSessions === 0 ? 30 : 7,
        priorityScore: 0.5,
      }));
    }

    return unique;
  }

  /**
   * Get the top N decisions for student-facing recommendations.
   */
  decideTop(state: StudentState, limit = 5): LearningDecision[] {
    return this.decideAll(state).slice(0, limit);
  }

  /**
   * Get the single highest-priority decision (for learning-engine compatibility).
   */
  decideOne(state: StudentState): LearningDecision {
    const all = this.decideAll(state);
    return all[0] ?? createLearningDecision({
      targetSkill: 'tenses',
      targetSkillZh: '時態',
      masteryBefore: 50,
      mistakeCount: 0,
      daysSinceLastPractice: 7,
      priorityScore: 0.5,
    });
  }

  // ============================================
  // Helpers — skillLabelZh imported from @/shared/utils/skill-labels
  // ============================================
}

export const learningDecisionEngine = new LearningDecisionEngine();
