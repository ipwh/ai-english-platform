// Sprint 21: Visualization Data Generator
// Generates React Flow compatible node/edge data from the knowledge graph
import { getKnowledgeGraph } from './knowledge-graph';
import type {
  VisualNode, VisualEdge, VisualizationData, KnowledgeNode,
} from '../types';
import type { SkillDimension } from '@/modules/student/profile/types';
import type { MasteryData } from './dependency-resolver';
import { topologicalSort } from './dependency-resolver';

// ============================================
// Color mapping per skill dimension
// ============================================

const SKILL_COLORS: Record<SkillDimension, { bg: string; border: string }> = {
  grammar:    { bg: '#e3f2fd', border: '#1976d2' },
  vocabulary: { bg: '#e8f5e9', border: '#388e3c' },
  reading:    { bg: '#fff3e0', border: '#f57c00' },
  writing:    { bg: '#fce4ec', border: '#c62828' },
  listening:  { bg: '#f3e5f5', border: '#7b1fa2' },
  speaking:   { bg: '#e0f7fa', border: '#00838f' },
};

// ============================================
// Layered Layout Algorithm
// ============================================

function computeLayeredLayout(nodes: KnowledgeNode[]): Map<string, { x: number; y: number }> {
  const graph = getKnowledgeGraph();
  const sorted = topologicalSort(graph);

  // Group nodes by layer (depth in prerequisite chain)
  const layerMap = new Map<string, number>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  function assignLayer(nodeId: string): number {
    if (layerMap.has(nodeId)) return layerMap.get(nodeId)!;

    const node = nodeMap.get(nodeId);
    if (!node || node.prerequisites.length === 0) {
      layerMap.set(nodeId, 0);
      return 0;
    }

    let maxPrereqLayer = 0;
    for (const prereq of node.prerequisites) {
      maxPrereqLayer = Math.max(maxPrereqLayer, assignLayer(prereq) + 1);
    }

    layerMap.set(nodeId, maxPrereqLayer);
    return maxPrereqLayer;
  }

  for (const node of nodes) {
    assignLayer(node.id);
  }

  // Count nodes per layer for horizontal positioning
  const layerCounts = new Map<number, number>();
  const layerIndexes = new Map<number, number>();

  for (const [, layer] of layerMap) {
    layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
  }

  // Compute positions
  const positions = new Map<string, { x: number; y: number }>();
  const H_SPACING = 220;
  const V_SPACING = 120;

  // Process nodes in topological order for consistent layout
  for (const nodeId of sorted.order) {
    if (!nodeMap.has(nodeId)) continue;

    const layer = layerMap.get(nodeId) ?? 0;
    const index = layerIndexes.get(layer) ?? 0;
    const count = layerCounts.get(layer) ?? 1;

    // Center nodes within their layer
    const x = (index - (count - 1) / 2) * H_SPACING + 400;
    const y = layer * V_SPACING + 50;

    positions.set(nodeId, { x, y });
    layerIndexes.set(layer, index + 1);
  }

  return positions;
}

// ============================================
// Main Generator
// ============================================

export interface VisualizationOptions {
  /** Filter by skill dimension (undefined = all) */
  skillFilter?: SkillDimension;
  /** Student mastery data for coloring */
  masteryData?: MasteryData[];
  /** Highlight a specific node */
  highlightNode?: string;
  /** Layout algorithm */
  layout?: 'layered' | 'force' | 'radial';
  /** Maximum nodes to show */
  maxNodes?: number;
}

export function generateVisualization(options?: VisualizationOptions): VisualizationData {
  const graph = getKnowledgeGraph();
  const layout = options?.layout ?? 'layered';

  let nodes = [...graph.nodes.values()];

  // Apply skill filter
  if (options?.skillFilter) {
    nodes = nodes.filter(n => n.skill === options.skillFilter);
  }

  // Apply max nodes limit
  if (options?.maxNodes && nodes.length > options.maxNodes) {
    nodes = nodes.slice(0, options.maxNodes);
  }

  // Compute positions
  const positions = computeLayeredLayout(nodes);

  // Build mastery map
  const masteryMap = new Map<string, number>();
  if (options?.masteryData) {
    for (const m of options.masteryData) {
      masteryMap.set(m.nodeId, m.currentMastery);
    }
  }

  // Build visual nodes
  const visualNodes: VisualNode[] = nodes.map(node => {
    const mastery = masteryMap.get(node.id);
    const isMastered = mastery !== undefined && mastery >= node.masteryThreshold;
    const isUnlocked = node.prerequisites.length === 0 ||
      node.prerequisites.every(prereq => {
        const prereqMastery = masteryMap.get(prereq);
        return prereqMastery !== undefined && prereqMastery >= (graph.nodes.get(prereq)?.masteryThreshold ?? 70);
      });
    const isHighlighted = options?.highlightNode === node.id;

    return {
      id: node.id,
      type: 'knowledgeNode',
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label: node.title,
        labelZh: node.titleZh,
        skill: node.skill,
        difficulty: node.difficulty,
        cefr: node.cefr,
        hkdseLevel: node.hkdseLevel,
        isMastered,
        masteryScore: mastery,
        isUnlocked,
        isRecommended: isHighlighted,
      },
    };
  });

  // Build visual edges
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const addedEdges = new Set<string>();
  const visualEdges: VisualEdge[] = [];

  for (const edge of graph.edges) {
    // Only include edges where both endpoints are in the filtered set
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) continue;

    const edgeKey = `${edge.source}→${edge.target}`;
    if (addedEdges.has(edgeKey)) continue;
    addedEdges.add(edgeKey);

    visualEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: '#bdbdbd',
        strokeWidth: 2,
      },
      data: {
        label: edge.label,
        type: edge.type,
      },
    });
  }

  return {
    nodes: visualNodes,
    edges: visualEdges,
    metadata: {
      totalNodes: visualNodes.length,
      totalEdges: visualEdges.length,
      layoutAlgorithm: layout,
    },
  };
}

/**
 * Generate a minimal visualization showing only the path
 * between two nodes (useful for learning path display).
 */
export function generatePathVisualization(
  fromId: string,
  toId: string,
): VisualizationData | null {
  const graph = getKnowledgeGraph();
  const from = graph.nodes.get(fromId);
  const to = graph.nodes.get(toId);
  if (!from || !to) return null;

  // Get all nodes in the dependency chain
  const relevantNodes = new Set<string>([fromId, toId]);

  // Add nodes between them (collect all that connect from→to)
  const allPrereqs = new Set<string>();
  function collectPrereqs(nodeId: string): void {
    if (allPrereqs.has(nodeId)) return;
    allPrereqs.add(nodeId);
    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const prereq of node.prerequisites) {
        collectPrereqs(prereq);
      }
    }
  }

  // Collect prerequisites of target that are successors of source
  collectPrereqs(toId);
  for (const id of allPrereqs) {
    const successors = graph.nodes.get(id)?.successors ?? [];
    for (const succ of successors) {
      if (allPrereqs.has(succ)) {
        relevantNodes.add(id);
        relevantNodes.add(succ);
      }
    }
  }

  return generateVisualization({
    maxNodes: relevantNodes.size + 10,
    highlightNode: toId,
    layout: 'layered',
  });
}

/**
 * Generate a skill-color legend for the UI.
 */
export function generateLegend(): Array<{
  skill: SkillDimension;
  label: string;
  labelZh: string;
  color: string;
}> {
  return [
    { skill: 'grammar', label: 'Grammar', labelZh: '文法', color: SKILL_COLORS.grammar.border },
    { skill: 'vocabulary', label: 'Vocabulary', labelZh: '詞彙', color: SKILL_COLORS.vocabulary.border },
    { skill: 'reading', label: 'Reading', labelZh: '閱讀', color: SKILL_COLORS.reading.border },
    { skill: 'writing', label: 'Writing', labelZh: '寫作', color: SKILL_COLORS.writing.border },
    { skill: 'listening', label: 'Listening', labelZh: '聆聽', color: SKILL_COLORS.listening.border },
    { skill: 'speaking', label: 'Speaking', labelZh: '口語', color: SKILL_COLORS.speaking.border },
  ];
}
