// Sprint 34: KnowledgeTraversalService — graph navigation strategies
import { getKnowledgeGraph } from './knowledge-graph';
import { topologicalSort } from './dependency-resolver';
import type {
  KnowledgeGraph, TraversalStrategy, TraversalResult,
} from '../types';
import type { SkillDimension } from '@/modules/student/profile/types';

// ============================================
// KnowledgeTraversalService
// ============================================

export class KnowledgeTraversalService {
  private graph = getKnowledgeGraph;

  /** Traverse the graph using a specified strategy */
  traverse(opts: {
    strategy: TraversalStrategy;
    startNodeId?: string;
    skillFilter?: SkillDimension;
    masteryScores?: Record<string, number>;
    maxNodes?: number;
  }): TraversalResult {
    const g = this.graph();
    const { strategy, startNodeId, skillFilter, masteryScores, maxNodes } = opts;
    let path: string[];

    switch (strategy) {
      case 'dfs': path = this.dfs(g, startNodeId, skillFilter); break;
      case 'bfs': path = this.bfs(g, startNodeId, skillFilter); break;
      case 'topological': path = this.topological(g, skillFilter); break;
      case 'importance-first': path = this.importanceFirst(g, skillFilter); break;
      case 'weakness-first': path = this.weaknessFirst(g, masteryScores ?? {}, skillFilter); break;
      default: path = [];
    }

    const limited = maxNodes ? path.slice(0, maxNodes) : path;
    const totalMinutes = limited.reduce((sum, id) => sum + (g.nodes.get(id)?.estimatedLearningTime ?? 0), 0);

    return {
      path: limited,
      visitedCount: limited.length,
      strategy,
      totalEstimatedMinutes: totalMinutes,
    };
  }

  /** BFS traversal — start from source nodes (no prerequisites) or a specific node */
  bfs(g: KnowledgeGraph, startNodeId?: string, skillFilter?: SkillDimension): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const queue: string[] = [];

    if (startNodeId) {
      const node = g.nodes.get(startNodeId);
      if (node && (!skillFilter || node.skill === skillFilter)) {
        queue.push(startNodeId);
      }
    } else {
      // Start from all source nodes (no prerequisites)
      for (const [id, node] of g.nodes) {
        if (skillFilter && node.skill !== skillFilter) continue;
        if (node.prerequisites.length === 0) queue.push(id);
      }
      queue.sort(); // Deterministic
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      result.push(current);

      const node = g.nodes.get(current);
      if (!node) continue;

      for (const succ of node.successors) {
        if (!visited.has(succ)) {
          const succNode = g.nodes.get(succ);
          if (succNode && (!skillFilter || succNode.skill === skillFilter)) {
            queue.push(succ);
          }
        }
      }
    }

    return result;
  }

  /** DFS traversal */
  dfs(g: KnowledgeGraph, startNodeId?: string, skillFilter?: SkillDimension): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const dfsRecurse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      result.push(nodeId);

      const node = g.nodes.get(nodeId);
      if (!node) return;

      for (const succ of node.successors.sort()) {
        const succNode = g.nodes.get(succ);
        if (succNode && (!skillFilter || succNode.skill === skillFilter)) {
          dfsRecurse(succ);
        }
      }
    };

    if (startNodeId) {
      dfsRecurse(startNodeId);
    } else {
      const sourceNodes = [...g.nodes.entries()]
        .filter(([, n]) => n.prerequisites.length === 0)
        .map(([id]) => id)
        .sort();
      for (const id of sourceNodes) {
        const node = g.nodes.get(id);
        if (!skillFilter || node?.skill === skillFilter) dfsRecurse(id);
      }
    }

    return result;
  }

  /** Topological sort-based traversal */
  topological(g: KnowledgeGraph, skillFilter?: SkillDimension): string[] {
    const filterSet = skillFilter
      ? new Set([...g.nodes.entries()].filter(([, n]) => n.skill === skillFilter).map(([id]) => id))
      : undefined;
    const result = topologicalSort(g, filterSet);
    return result.order.filter(id => !result.hasCycle || !result.cycleNodes?.includes(id));
  }

  /** Traverse by importance weight (highest first) */
  importanceFirst(g: KnowledgeGraph, skillFilter?: SkillDimension): string[] {
    const nodes = [...g.nodes.entries()]
      .filter(([, n]) => !skillFilter || n.skill === skillFilter)
      .sort(([, a], [, b]) => (b.importanceWeight ?? 0.5) - (a.importanceWeight ?? 0.5));

    return nodes.map(([id]) => id);
  }

  /** Traverse by mastery weakness (lowest mastery first) */
  weaknessFirst(g: KnowledgeGraph, masteryScores: Record<string, number>, skillFilter?: SkillDimension): string[] {
    const nodes = [...g.nodes.entries()]
      .filter(([, n]) => !skillFilter || n.skill === skillFilter)
      .sort(([idA, a], [idB, b]) => {
        const mA = masteryScores[idA] ?? 0;
        const mB = masteryScores[idB] ?? 0;
        // Weighted: low mastery * high importance = higher priority
        const scoreA = (1 - mA) * (a.importanceWeight ?? 0.5);
        const scoreB = (1 - mB) * (b.importanceWeight ?? 0.5);
        return scoreB - scoreA;
      });

    return nodes.map(([id]) => id);
  }
}

export const knowledgeTraversalService = new KnowledgeTraversalService();
