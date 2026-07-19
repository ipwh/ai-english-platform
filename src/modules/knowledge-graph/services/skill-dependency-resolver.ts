// Sprint 34: SkillDependencyResolver — cross-skill analysis + bottleneck + prediction
import { getKnowledgeGraph } from './knowledge-graph';
import { getAllSuccessors, getAllPrerequisites } from './dependency-resolver';
import type {
  KnowledgeGraph, NextSkillPrediction, BottleneckResult,
} from '../types';

// ============================================
// SkillDependencyResolver
// ============================================

export class SkillDependencyResolver {

  /** Find bottleneck nodes — nodes blocking many successors */
  findBottlenecks(opts: {
    masteredNodeIds: string[];
    skillFilter?: string;
  }): BottleneckResult {
    const g = getKnowledgeGraph();
    const { masteredNodeIds, skillFilter } = opts;
    const masteredSet = new Set(masteredNodeIds);

    const bottlenecks: BottleneckResult['bottlenecks'] = [];

    for (const [nodeId, node] of g.nodes) {
      if (skillFilter && node.skill !== skillFilter) continue;
      if (masteredSet.has(nodeId)) continue;

      // Find all nodes blocked by this unmastered node
      const allSuccessors = getAllSuccessors(g, nodeId);
      const blockedNodes = allSuccessors.filter(sid => {
        const sNode = g.nodes.get(sid);
        if (!sNode) return false;
        // Node is blocked if all its prerequisites are not mastered
        if (skillFilter && sNode.skill !== skillFilter) return false;
        return sNode.prerequisites.some(p => !masteredSet.has(p));
      });

      if (blockedNodes.length === 0) continue;

      const blockedMinutes = blockedNodes.reduce((sum, sid) =>
        sum + (g.nodes.get(sid)?.estimatedLearningTime ?? 0), 0);

      bottlenecks.push({
        nodeId,
        title: node.title,
        titleZh: node.titleZh,
        blocksCount: blockedNodes.length,
        blockedNodes,
        blockedContentMinutes: blockedMinutes,
      });
    }

    // Sort by impact (blocksCount * blockedMinutes)
    bottlenecks.sort((a, b) =>
      (b.blocksCount * b.blockedContentMinutes) - (a.blocksCount * a.blockedContentMinutes));

    return {
      bottlenecks,
      highestImpact: bottlenecks[0]?.nodeId ?? null,
    };
  }

  /** Predict the next skill the student should learn */
  predictNextSkills(opts: {
    studentId: string;
    masteryScores: Record<string, number>;
    masteredNodeIds: string[];
    gradeLevel: string;
    preferredSkills?: string[];
  }): NextSkillPrediction {
    const g = getKnowledgeGraph();
    const { studentId, masteryScores, masteredNodeIds, gradeLevel, preferredSkills } = opts;
    const masteredSet = new Set(masteredNodeIds);

    // Find unlocked nodes (all prerequisites mastered) but not yet mastered
    const candidates: Array<{
      nodeId: string;
      title: string;
      titleZh: string;
      confidence: number;
    }> = [];

    for (const [nodeId, node] of g.nodes) {
      if (masteredSet.has(nodeId)) continue;

      // Check if all prerequisites are mastered
      const allPrereqsReady = node.prerequisites.every(p => masteredSet.has(p));
      if (!allPrereqsReady) continue;

      // Calculate confidence score
      const avgPrereqMastery = node.prerequisites.length > 0
        ? node.prerequisites.reduce((s, p) => s + (masteryScores[p] ?? 0), 0) / node.prerequisites.length
        : 100;

      const score = (
        (avgPrereqMastery / 100) * 0.3 +
        (node.importanceWeight ?? 0.5) * 0.3 +
        (1 - (masteryScores[nodeId] ?? 0) / 100) * 0.2 +
        (preferredSkills?.includes(node.skill) ? 0.2 : 0)
      );

      const gradeNum = parseInt(gradeLevel.slice(1));
      const nodeGradeNum = parseInt(node.hkdseLevel.slice(1));
      const gradeBonus = nodeGradeNum <= gradeNum ? 0.1 : -0.1;

      candidates.push({
        nodeId,
        title: node.title,
        titleZh: node.titleZh,
        confidence: Math.min(1, Math.max(0, Math.round((score + gradeBonus) * 100) / 100)),
      });
    }

    // Sort by confidence and take top 5
    candidates.sort((a, b) => b.confidence - a.confidence);
    const top5 = candidates.slice(0, 5);

    const predictions = top5.map(c => {
      const node = g.nodes.get(c.nodeId)!;
      const prereqMastery = node.prerequisites.length > 0
        ? node.prerequisites.reduce((s, p) => s + (masteryScores[p] ?? 0), 0) / node.prerequisites.length
        : 100;

      return {
        nodeId: c.nodeId,
        title: c.title,
        titleZh: c.titleZh,
        confidence: c.confidence,
        reason: `Prerequisites mastered (avg ${Math.round(prereqMastery)}%), importance ${node.importanceWeight}, aligned with ${gradeLevel}`,
        reasonZh: `先決條件已掌握（平均 ${Math.round(prereqMastery)}%），重要性 ${node.importanceWeight}，與 ${gradeLevel} 對齊`,
      };
    });

    // Check if student is ready to advance
    const currentLevelNodes = [...g.nodes.entries()]
      .filter(([, node]) => node.hkdseLevel === gradeLevel);
    const allCurrentMastered = currentLevelNodes.every(([id]) => masteredSet.has(id));
    const readyToAdvance = allCurrentMastered && currentLevelNodes.length > 0;

    return {
      studentId,
      predictions,
      readyToAdvance,
      suggestedCefrLevel: readyToAdvance ? 'B2' : 'B1',
    };
  }

  /** Find cross-skill dependencies (nodes that bridge different skill dimensions) */
  findCrossSkillDependencies(): Array<{
    nodeId: string;
    title: string;
    skill: string;
    prerequisiteSkills: string[];
    successorSkills: string[];
  }> {
    const g = getKnowledgeGraph();
    const results: Array<{
      nodeId: string;
      title: string;
      skill: string;
      prerequisiteSkills: string[];
      successorSkills: string[];
    }> = [];

    for (const [nodeId, node] of g.nodes) {
      // Find prerequisites from different skills
      const prereqSkills = new Set<string>();
      for (const pid of node.prerequisites) {
        const pNode = g.nodes.get(pid);
        if (pNode && pNode.skill !== node.skill) {
          prereqSkills.add(pNode.skill);
        }
      }

      // Find successors from different skills
      const succSkills = new Set<string>();
      const allSucc = getAllSuccessors(g, nodeId);
      for (const sid of allSucc) {
        const sNode = g.nodes.get(sid);
        if (sNode && sNode.skill !== node.skill) {
          succSkills.add(sNode.skill);
        }
      }

      if (prereqSkills.size > 0 || succSkills.size > 0) {
        results.push({
          nodeId, title: node.title, skill: node.skill,
          prerequisiteSkills: [...prereqSkills],
          successorSkills: [...succSkills],
        });
      }
    }

    return results;
  }
}

export const skillDependencyResolver = new SkillDependencyResolver();
