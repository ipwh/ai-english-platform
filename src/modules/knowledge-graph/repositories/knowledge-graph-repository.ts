// Sprint 21: Knowledge Graph Repository
// Data access layer — wraps the in-memory graph with query methods
import type {
  KnowledgeNode, KnowledgeEdge, KnowledgeGraph,
  CEFRLevel, HKDSELevel,
} from '../types';
import type { SkillDimension } from '@/modules/student/profile/types';
import { getKnowledgeGraph, invalidateGraphCache } from '../services/knowledge-graph';

class KnowledgeGraphRepository {
  private get graph(): KnowledgeGraph {
    return getKnowledgeGraph();
  }

  // ============================================
  // Node Queries
  // ============================================

  /** Get a single node by ID */
  getNode(id: string): KnowledgeNode | undefined {
    return this.graph.nodes.get(id);
  }

  /** Get all nodes */
  getAllNodes(): KnowledgeNode[] {
    return [...this.graph.nodes.values()];
  }

  /** Get nodes filtered by skill dimension */
  getNodesBySkill(skill: SkillDimension): KnowledgeNode[] {
    return this.getAllNodes().filter(n => n.skill === skill);
  }

  /** Get nodes filtered by CEFR level */
  getNodesByCefr(cefr: CEFRLevel): KnowledgeNode[] {
    return this.getAllNodes().filter(n => n.cefr === cefr);
  }

  /** Get nodes filtered by HKDSE level */
  getNodesByHkdse(level: HKDSELevel): KnowledgeNode[] {
    return this.getAllNodes().filter(n => n.hkdseLevel === level);
  }

  /** Get nodes by difficulty rating */
  getNodesByDifficulty(difficulty: 1 | 2 | 3 | 4 | 5): KnowledgeNode[] {
    return this.getAllNodes().filter(n => n.difficulty === difficulty);
  }

  /** Get entry nodes (no prerequisites) */
  getEntryNodes(): KnowledgeNode[] {
    return this.getAllNodes().filter(n => n.prerequisites.length === 0);
  }

  /** Get leaf nodes (no successors) */
  getLeafNodes(): KnowledgeNode[] {
    return this.getAllNodes().filter(n => n.successors.length === 0);
  }

  /** Search nodes by tag */
  searchByTag(tag: string): KnowledgeNode[] {
    const lower = tag.toLowerCase();
    return this.getAllNodes().filter(n => n.tags.some(t => t.toLowerCase().includes(lower)));
  }

  /** Search nodes by title (English or Chinese) */
  searchByTitle(query: string): KnowledgeNode[] {
    const lower = query.toLowerCase();
    return this.getAllNodes().filter(n =>
      n.title.toLowerCase().includes(lower) ||
      n.titleZh.includes(query)
    );
  }

  // ============================================
  // Edge Queries
  // ============================================

  /** Get all edges */
  getAllEdges(): KnowledgeEdge[] {
    return this.graph.edges;
  }

  /** Get edges for a specific node (incoming + outgoing) */
  getEdgesForNode(nodeId: string): KnowledgeEdge[] {
    return this.graph.edges.filter(e => e.source === nodeId || e.target === nodeId);
  }

  /** Get incoming edges to a node */
  getIncomingEdges(nodeId: string): KnowledgeEdge[] {
    return this.graph.edges.filter(e => e.target === nodeId);
  }

  /** Get outgoing edges from a node */
  getOutgoingEdges(nodeId: string): KnowledgeEdge[] {
    return this.graph.edges.filter(e => e.source === nodeId);
  }

  // ============================================
  // Graph Metadata
  // ============================================

  getMetadata() {
    return this.graph.metadata;
  }

  getNodeCount(): number {
    return this.graph.metadata.totalNodes;
  }

  getEdgeCount(): number {
    return this.graph.metadata.totalEdges;
  }

  getNodesPerSkill(): Record<SkillDimension, number> {
    return { ...this.graph.metadata.nodesPerSkill };
  }

  getNodesPerCefr(): Record<CEFRLevel, number> {
    return { ...this.graph.metadata.nodesPerCefr };
  }

  getNodesPerHkdse(): Record<HKDSELevel, number> {
    return { ...this.graph.metadata.nodesPerHkdse };
  }

  // ============================================
  // Cache Management
  // ============================================

  /** Force reload the graph (useful after updates) */
  reload(): void {
    invalidateGraphCache();
  }

  /** Check if the graph is loaded */
  isLoaded(): boolean {
    return this.graph.nodes.size > 0;
  }
}

export const knowledgeGraphRepo = new KnowledgeGraphRepository();
