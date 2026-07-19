// Sprint 34: WeaknessLocator — enhanced weakness detection with forgetting curve
import { getKnowledgeGraph } from './knowledge-graph';
import { getAllPrerequisites } from './dependency-resolver';
import type {
  KnowledgeGraph, EnhancedWeaknessResult,
} from '../types';

// ============================================
// WeaknessLocator
// ============================================

export class WeaknessLocator {

  /** Find all weaknesses with enhanced metrics */
  locate(opts: {
    studentId: string;
    masteryScores: Record<string, number>;
    retentionData?: Record<string, number>; // nodeId → retention probability
    lastReviewDates?: Record<string, string>; // nodeId → ISO date
    skillFilter?: string;
  }): EnhancedWeaknessResult {
    const g = getKnowledgeGraph();
    const { studentId, masteryScores, retentionData, lastReviewDates, skillFilter } = opts;

    const weaknesses: EnhancedWeaknessResult['weaknesses'] = [];
    const now = new Date();

    for (const [nodeId, node] of g.nodes) {
      if (skillFilter && node.skill !== skillFilter) continue;

      const mastery = masteryScores[nodeId] ?? 0;
      if (mastery >= node.masteryThreshold) continue;

      const gap = node.masteryThreshold - mastery;
      const retention = retentionData?.[nodeId] ?? 1.0;
      const lastReview = lastReviewDates?.[nodeId];

      // Days since last review (affects urgency)
      let daysSinceReview = 30; // default to high urgency if never reviewed
      if (lastReview) {
        daysSinceReview = (now.getTime() - new Date(lastReview).getTime()) / 86400000;
      }

      // Composite urgency score
      const gapFactor = Math.min(1, gap / 50); // 0..1
      const forgettingFactor = 1 - retention; // higher = more forgotten
      const stalenessFactor = Math.min(1, daysSinceReview / 14); // 0..1 after 14 days
      const importanceFactor = node.importanceWeight ?? 0.5;

      const urgencyScore = (gapFactor * 0.35 + forgettingFactor * 0.25 + stalenessFactor * 0.15 + importanceFactor * 0.25);

      let urgency: EnhancedWeaknessResult['weaknesses'][0]['urgency'] = 'low';
      if (urgencyScore >= 0.7) urgency = 'critical';
      else if (urgencyScore >= 0.5) urgency = 'high';
      else if (urgencyScore >= 0.3) urgency = 'medium';

      // Find weak prerequisites
      const allPrereqs = getAllPrerequisites(g, nodeId);
      const weakPrereqs = allPrereqs.filter(pid => (masteryScores[pid] ?? 0) < (g.nodes.get(pid)?.masteryThreshold ?? 70));

      // Estimate fix time (minutes to bring to threshold)
      const estimatedFixTime = Math.ceil(gap / 5 * node.estimatedLearningTime * (1 - retention));

      weaknesses.push({
        nodeId,
        title: node.title,
        titleZh: node.titleZh,
        skill: node.skill,
        currentMastery: mastery,
        masteryThreshold: node.masteryThreshold,
        masteryGap: Math.round(gap),
        forgettingWeight: node.forgettingWeight ?? 0.5,
        importanceWeight: node.importanceWeight ?? 0.5,
        urgencyScore: Math.round(urgencyScore * 100) / 100,
        urgency,
        estimatedFixTime,
        weakPrerequisites: weakPrereqs,
        recommendedExercises: node.recommendedExercises ?? ['mcq'],
      });
    }

    // Sort by urgency score descending
    weaknesses.sort((a, b) => b.urgencyScore - a.urgencyScore);

    // Skill-level breakdown
    const skillMap = new Map<string, { weakCount: number; totalGap: number }>();
    for (const w of weaknesses) {
      const existing = skillMap.get(w.skill) || { weakCount: 0, totalGap: 0 };
      existing.weakCount++;
      existing.totalGap += w.masteryGap;
      skillMap.set(w.skill, existing);
    }

    const skillBreakdown = [...skillMap.entries()].map(([skill, data]) => ({
      skill,
      weakCount: data.weakCount,
      averageGap: Math.round(data.totalGap / data.weakCount),
    }));

    return {
      studentId,
      generatedAt: now.toISOString(),
      weaknesses,
      skillBreakdown,
      criticalItems: weaknesses.filter(w => w.urgency === 'critical').map(w => w.nodeId),
    };
  }

  /** Detect learning gaps — compare expected vs actual */
  detectGaps(opts: {
    studentId: string;
    gradeLevel: string;
    masteredNodeIds: string[];
    currentCefrLevel?: string;
  }): import('../types').LearningGapResult {
    const g = getKnowledgeGraph();
    const { studentId, gradeLevel, masteredNodeIds, currentCefrLevel } = opts;

    const masteredSet = new Set(masteredNodeIds);

    // Expected nodes: all nodes at or below student's grade level
    const expectedNodes = [...g.nodes.entries()]
      .filter(([, node]) => {
        const gradeNum = parseInt(gradeLevel.slice(1));
        const nodeGradeNum = parseInt(node.hkdseLevel.slice(1));
        return nodeGradeNum <= gradeNum;
      })
      .map(([id]) => id);

    // Gap nodes: expected but not mastered
    const gapNodes = expectedNodes
      .filter(id => !masteredSet.has(id))
      .map(id => {
        const node = g.nodes.get(id)!;
        const gradeNum = parseInt(gradeLevel.slice(1));
        const nodeGradeNum = parseInt(node.hkdseLevel.slice(1));
        const gradeGap = gradeNum - nodeGradeNum;
        const estimatedDaysBehind = gradeGap * 0; // Simplified — in practice would use actual dates

        return {
          nodeId: id,
          title: node.title,
          titleZh: node.titleZh,
          skill: node.skill,
          importanceWeight: node.importanceWeight ?? 0.5,
          estimatedDaysBehind: Math.max(1, gradeGap * 30), // rough estimate
        };
      })
      .sort((a, b) => (b.importanceWeight ?? 0.5) - (a.importanceWeight ?? 0.5));

    // Severity
    const gapRatio = expectedNodes.length > 0 ? gapNodes.length / expectedNodes.length : 0;
    let severity: import('../types').LearningGapResult['severity'] = 'none';
    if (gapRatio > 0.3) severity = 'severe';
    else if (gapRatio > 0.15) severity = 'moderate';
    else if (gapRatio > 0.05) severity = 'minor';

    const catchUpPlan = gapNodes.slice(0, 5).map(g =>
      `Study "${g.title}" (${g.skill}) — estimated ${g.estimatedDaysBehind} days behind`,
    );
    const catchUpPlanZh = gapNodes.slice(0, 5).map(g =>
      `學習「${g.titleZh}」（${g.skill}）— 預計落後 ${g.estimatedDaysBehind} 天`,
    );

    return {
      studentId,
      gradeLevel,
      expectedNodes,
      masteredNodes: masteredNodeIds,
      gapNodes,
      severity,
      catchUpPlan,
      catchUpPlanZh,
    };
  }
}

export const weaknessLocator = new WeaknessLocator();
