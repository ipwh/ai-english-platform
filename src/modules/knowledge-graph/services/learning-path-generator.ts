// Sprint 34: LearningPathGenerator — multi-criteria path generation
import { getKnowledgeGraph } from './knowledge-graph';
import type {
  KnowledgeGraph, GeneratedLearningPath,
} from '../types';

// ============================================
// LearningPathGenerator
// ============================================

export class LearningPathGenerator {
  private graph = getKnowledgeGraph;

  /** Generate a personalized learning path */
  generate(opts: {
    studentId: string;
    strategy: GeneratedLearningPath['strategy'];
    gradeLevel: string;
    masteryScores?: Record<string, number>;
    targetNodeId?: string;
    skillFocus?: string;
    maxTimeMinutes?: number;
    maxNodes?: number;
  }): GeneratedLearningPath {
    const g = this.graph();
    const { studentId, strategy, masteryScores, targetNodeId, skillFocus, maxTimeMinutes, maxNodes } = opts;

    let nodeIds: string[];
    let rationale = '';
    let rationaleZh = '';

    switch (strategy) {
      case 'shortest-time': {
        const result = this.shortestTimePath(g, masteryScores ?? {}, targetNodeId, maxTimeMinutes);
        nodeIds = result.nodes;
        rationale = result.rationale;
        rationaleZh = result.rationaleZh;
        break;
      }
      case 'highest-importance': {
        const result = this.highestImportancePath(g, masteryScores ?? {}, skillFocus, maxNodes);
        nodeIds = result.nodes;
        rationale = result.rationale;
        rationaleZh = result.rationaleZh;
        break;
      }
      case 'weakness-first': {
        const result = this.weaknessFirstPath(g, masteryScores ?? {}, skillFocus, maxNodes);
        nodeIds = result.nodes;
        rationale = result.rationale;
        rationaleZh = result.rationaleZh;
        break;
      }
      case 'balanced': {
        const result = this.balancedPath(g, masteryScores ?? {}, maxTimeMinutes, maxNodes);
        nodeIds = result.nodes;
        rationale = result.rationale;
        rationaleZh = result.rationaleZh;
        break;
      }
      case 'exam-prep': {
        const result = this.examPrepPath(g, opts.gradeLevel, masteryScores ?? {}, maxTimeMinutes);
        nodeIds = result.nodes;
        rationale = result.rationale;
        rationaleZh = result.rationaleZh;
        break;
      }
      default:
        nodeIds = [];
        rationale = 'No strategy selected';
        rationaleZh = '未選擇策略';
    }

    const nodeDetails = nodeIds.map(id => {
      const node = g.nodes.get(id);
      return {
        nodeId: id,
        title: node?.title ?? id,
        titleZh: node?.titleZh ?? id,
        estimatedMinutes: node?.estimatedLearningTime ?? 0,
        currentMastery: masteryScores?.[id],
        isMastered: (masteryScores?.[id] ?? 0) >= (node?.masteryThreshold ?? 70),
        isWeakness: (masteryScores?.[id] ?? 0) < (node?.masteryThreshold ?? 70),
      };
    });

    const totalTime = nodeDetails.reduce((s, d) => s + d.estimatedMinutes, 0);

    return {
      id: `lp_${studentId}_${Date.now()}`,
      nodes: nodeIds,
      nodeDetails,
      totalTimeMinutes: totalTime,
      strategy,
      rationale,
      rationaleZh,
    };
  }

  // ============================================
  // Strategy implementations
  // ============================================

  private shortestTimePath(
    g: KnowledgeGraph,
    masteryScores: Record<string, number>,
    targetNodeId?: string,
    maxMinutes?: number,
  ): { nodes: string[]; rationale: string; rationaleZh: string } {
    // Find unmastered nodes sorted by estimated time
    const unmastered = [...g.nodes.entries()]
      .filter(([id, node]) => (masteryScores[id] ?? 0) < node.masteryThreshold)
      .sort(([, a], [, b]) => a.estimatedLearningTime - b.estimatedLearningTime);

    const nodes: string[] = [];
    let totalTime = 0;

    for (const [id, node] of unmastered) {
      if (maxMinutes && totalTime + node.estimatedLearningTime > maxMinutes) continue;
      if (targetNodeId && id !== targetNodeId) {
        // Check if this is a prerequisite of target
        const prereqs = new Set([...node.prerequisites, ...(g.nodes.get(targetNodeId)?.prerequisites ?? [])]);
        if (!prereqs.has(id) && id !== targetNodeId) continue;
      }
      nodes.push(id);
      totalTime += node.estimatedLearningTime;
    }

    return {
      nodes: nodes.slice(0, 20),
      rationale: `Shortest time path: ${nodes.length} nodes, ~${totalTime} minutes total`,
      rationaleZh: `最短路徑：${nodes.length} 個節點，約 ${totalTime} 分鐘`,
    };
  }

  private highestImportancePath(
    g: KnowledgeGraph,
    masteryScores: Record<string, number>,
    skillFocus?: string,
    maxNodes?: number,
  ): { nodes: string[]; rationale: string; rationaleZh: string } {
    const nodes = [...g.nodes.entries()]
      .filter(([, node]) => !skillFocus || node.skill === skillFocus)
      .filter(([id, node]) => (masteryScores[id] ?? 0) < node.masteryThreshold)
      .sort(([, a], [, b]) => (b.importanceWeight ?? 0.5) - (a.importanceWeight ?? 0.5))
      .map(([id]) => id)
      .slice(0, maxNodes || 15);

    return {
      nodes,
      rationale: `Highest importance path: ${nodes.length} high-priority nodes for DSE exam`,
      rationaleZh: `最高重要性路徑：${nodes.length} 個 DSE 重點節點`,
    };
  }

  private weaknessFirstPath(
    g: KnowledgeGraph,
    masteryScores: Record<string, number>,
    skillFocus?: string,
    maxNodes?: number,
  ): { nodes: string[]; rationale: string; rationaleZh: string } {
    const nodes = [...g.nodes.entries()]
      .filter(([, node]) => !skillFocus || node.skill === skillFocus)
      .sort(([idA, a], [idB, b]) => {
        const scoreA = (1 - (masteryScores[idA] ?? 0)) * (a.importanceWeight ?? 0.5) * (a.forgettingWeight ?? 0.5);
        const scoreB = (1 - (masteryScores[idB] ?? 0)) * (b.importanceWeight ?? 0.5) * (b.forgettingWeight ?? 0.5);
        return scoreB - scoreA;
      })
      .map(([id]) => id)
      .slice(0, maxNodes || 15);

    return {
      nodes,
      rationale: `Weakness-first path: ${nodes.length} weakest nodes (weighted by importance × forgetting)`,
      rationaleZh: `弱項優先路徑：${nodes.length} 個最弱節點（按重要性 × 遺忘率加權）`,
    };
  }

  private balancedPath(
    g: KnowledgeGraph,
    masteryScores: Record<string, number>,
    maxMinutes?: number,
    maxNodes?: number,
  ): { nodes: string[]; rationale: string; rationaleZh: string } {
    // Mix: 40% weakness, 30% importance, 30% shortest time
    const allUnmastered = [...g.nodes.entries()]
      .filter(([id, node]) => (masteryScores[id] ?? 0) < node.masteryThreshold);

    const byWeakness = [...allUnmastered]
      .sort(([idA, a], [idB, b]) => {
        const sA = (1 - (masteryScores[idA] ?? 0)) * (a.forgettingWeight ?? 0.5);
        const sB = (1 - (masteryScores[idB] ?? 0)) * (b.forgettingWeight ?? 0.5);
        return sB - sA;
      });

    const byImportance = [...allUnmastered]
      .sort(([, a], [, b]) => (b.importanceWeight ?? 0.5) - (a.importanceWeight ?? 0.5));

    const byTime = [...allUnmastered]
      .sort(([, a], [, b]) => a.estimatedLearningTime - b.estimatedLearningTime);

    const limit = maxNodes || 12;
    const weaknessCount = Math.ceil(limit * 0.4);
    const importanceCount = Math.ceil(limit * 0.3);

    const seen = new Set<string>();
    const nodes: string[] = [];

    for (const [id] of byWeakness) { if (nodes.length >= weaknessCount) break; if (!seen.has(id)) { seen.add(id); nodes.push(id); } }
    for (const [id] of byImportance) { if (nodes.length >= weaknessCount + importanceCount) break; if (!seen.has(id)) { seen.add(id); nodes.push(id); } }
    for (const [id] of byTime) { if (nodes.length >= limit) break; if (!seen.has(id)) { seen.add(id); nodes.push(id); } }

    return {
      nodes,
      rationale: `Balanced path: ${nodes.length} nodes (40% weakness, 30% importance, 30% quick wins)`,
      rationaleZh: `均衡路徑：${nodes.length} 個節點（40% 弱項、30% 重點、30% 快速見效）`,
    };
  }

  private examPrepPath(
    g: KnowledgeGraph,
    gradeLevel: string,
    masteryScores: Record<string, number>,
    maxMinutes?: number,
  ): { nodes: string[]; rationale: string; rationaleZh: string } {
    // DSE exam prep: focus on high-importance nodes at student's grade level
    const nodes = [...g.nodes.entries()]
      .filter(([, node]) => node.hkdseLevel === gradeLevel || (node.importanceWeight ?? 0.5) >= 0.8)
      .filter(([id, node]) => (masteryScores[id] ?? 0) < node.masteryThreshold)
      .sort(([idA, a], [idB, b]) => {
        // Priority: high importance + low mastery + high forgetting
        const sA = (b.importanceWeight ?? 0.5) + (1 - (masteryScores[idA] ?? 0)) + (a.forgettingWeight ?? 0.5);
        const sB = (a.importanceWeight ?? 0.5) + (1 - (masteryScores[idB] ?? 0)) + (b.forgettingWeight ?? 0.5);
        return sB - sA;
      })
      .map(([id]) => id)
      .slice(0, 20);

    return {
      nodes,
      rationale: `DSE Exam Prep: ${nodes.length} high-priority nodes aligned with ${gradeLevel} DSE curriculum`,
      rationaleZh: `DSE 備試路徑：${nodes.length} 個與 ${gradeLevel} DSE 課程對齊的重點節點`,
    };
  }
}

export const learningPathGenerator = new LearningPathGenerator();
