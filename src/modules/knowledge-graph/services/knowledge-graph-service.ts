// Sprint 21: Knowledge Graph Service
// Business logic facade — integrates graph algorithms with existing modules
import { getKnowledgeGraph } from './knowledge-graph';
import { knowledgeGraphRepo } from '../repositories/knowledge-graph-repository';
import {
  topologicalSort, searchDependencies, shortestLearningPath,
  lookupWeaknesses, unlockNextSkills, hasCycle, findCycles,
  getGraphStats, getAllPrerequisites, getAllSuccessors,
} from './dependency-resolver';
import type { MasteryData } from './dependency-resolver';
import type {
  KnowledgeNode, TopologicalOrder, DependencyResult,
  LearningPathResult, WeaknessLookupResult, UnlockResult,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';

class KnowledgeGraphService {
  private graph = getKnowledgeGraph;

  // ============================================
  // Graph Initialization
  // ============================================

  /** Ensure the graph is loaded and ready */
  initialize(): { nodeCount: number; edgeCount: number; version: string } {
    const g = this.graph();
    return {
      nodeCount: g.metadata.totalNodes,
      edgeCount: g.metadata.totalEdges,
      version: g.metadata.version,
    };
  }

  // ============================================
  // Node Access
  // ============================================

  getNode(id: string): KnowledgeNode | undefined {
    return knowledgeGraphRepo.getNode(id);
  }

  getAllNodes(): KnowledgeNode[] {
    return knowledgeGraphRepo.getAllNodes();
  }

  getNodesBySkill(skill: SkillDimension): KnowledgeNode[] {
    return knowledgeGraphRepo.getNodesBySkill(skill);
  }

  // ============================================
  // Graph Algorithms
  // ============================================

  /** Get topological order of entire graph */
  getLearningOrder(): TopologicalOrder {
    return topologicalSort(this.graph());
  }

  /** Get topological order for a specific skill dimension */
  getLearningOrderForSkill(skill: SkillDimension): TopologicalOrder {
    const nodes = knowledgeGraphRepo.getNodesBySkill(skill);
    const nodeIds = new Set(nodes.map(n => n.id));
    return topologicalSort(this.graph(), nodeIds);
  }

  /** Search all dependencies for a node */
  getDependencies(nodeId: string): DependencyResult | null {
    return searchDependencies(this.graph(), nodeId);
  }

  /** Find shortest learning path between two nodes */
  findPath(fromId: string, toId: string): LearningPathResult {
    return shortestLearningPath(this.graph(), fromId, toId);
  }

  /** Check if graph has cycles (should always be false for valid curriculum) */
  checkForCycles(): { hasCycle: boolean; cycles?: string[][] } {
    if (hasCycle(this.graph())) {
      return { hasCycle: true, cycles: findCycles(this.graph()) };
    }
    return { hasCycle: false };
  }

  // ============================================
  // Student-Specific Queries
  // ============================================

  /** Look up weaknesses for a student based on mastery data */
  findWeaknesses(
    studentId: string,
    masteryData: MasteryData[],
    gradeLevel: string,
  ): WeaknessLookupResult {
    return lookupWeaknesses(this.graph(), studentId, masteryData, gradeLevel);
  }

  /** Determine which skills are newly unlocked for a student */
  getUnlockedSkills(
    studentId: string,
    masteryData: MasteryData[],
  ): UnlockResult {
    return unlockNextSkills(this.graph(), studentId, masteryData);
  }

  /** Get all prerequisites for a node (transitive closure) */
  getAllPrerequisites(nodeId: string): string[] {
    return getAllPrerequisites(this.graph(), nodeId);
  }

  /** Get all successors for a node (transitive closure) */
  getAllSuccessors(nodeId: string): string[] {
    return getAllSuccessors(this.graph(), nodeId);
  }

  // ============================================
  // Graph Statistics
  // ============================================

  getStats() {
    const stats = getGraphStats(this.graph());
    return {
      ...stats,
      metadata: knowledgeGraphRepo.getMetadata(),
    };
  }

  /** Get all edges (v4.1: exposed for API routes) */
  getAllEdges() {
    return knowledgeGraphRepo.getAllEdges();
  }

  // ============================================
  // Integration Helpers
  // ============================================

  /**
   * Convert mastery data from existing profile module format
   * to the format expected by the knowledge graph engine.
   */
  convertProfileMasteryToGraphMastery(
    subSkills: Array<{ skillId: string; accuracy: number }>,
  ): MasteryData[] {
    return subSkills.map(s => ({
      nodeId: s.skillId,
      currentMastery: Math.round(s.accuracy * 100),
    }));
  }

  /**
   * Check if a node's prerequisites are satisfied given mastery data.
   */
  arePrerequisitesMet(nodeId: string, masteryData: MasteryData[]): boolean {
    const node = this.getNode(nodeId);
    if (!node || node.prerequisites.length === 0) return true;

    const masteryMap = new Map(masteryData.map(m => [m.nodeId, m.currentMastery]));

    return node.prerequisites.every(prereqId => {
      const mastery = masteryMap.get(prereqId) ?? 0;
      const prereqNode = this.getNode(prereqId);
      const threshold = prereqNode?.masteryThreshold ?? 70;
      return mastery >= threshold;
    });
  }

  /**
   * Get the recommended next nodes for a student
   * combining unlock status with weakness analysis.
   */
  getRecommendedNext(
    studentId: string,
    masteryData: MasteryData[],
    gradeLevel: string,
    limit = 5,
  ): Array<{ nodeId: string; title: string; titleZh: string; reason: string }> {
    const results: Array<{ nodeId: string; title: string; titleZh: string; reason: string }> = [];

    // 1. Weaknesses first (high priority)
    const weaknesses = this.findWeaknesses(studentId, masteryData, gradeLevel);
    for (const w of weaknesses.weakNodes.slice(0, 3)) {
      results.push({
        nodeId: w.nodeId, title: w.title, titleZh: w.titleZh,
        reason: `weakness (mastery: ${w.currentMastery}%)`,
      });
    }

    // 2. Newly unlocked nodes (medium priority)
    const unlocked = this.getUnlockedSkills(studentId, masteryData);
    for (const u of unlocked.newlyUnlocked.slice(0, 2)) {
      if (results.length >= limit) break;
      if (!results.some(r => r.nodeId === u.nodeId)) {
        results.push({
          nodeId: u.nodeId, title: u.title, titleZh: u.titleZh,
          reason: 'newly unlocked',
        });
      }
    }

    return results.slice(0, limit);
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();
