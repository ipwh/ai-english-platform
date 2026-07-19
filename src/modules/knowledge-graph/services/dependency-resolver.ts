// Sprint 21: Knowledge Dependency Resolver
// Graph algorithms: topological sort, cycle detection, shortest path,
// dependency search, unlock calculation
import type {
  KnowledgeNode, KnowledgeEdge, KnowledgeGraph,
  TopologicalOrder, DependencyResult, LearningPathResult,
  WeaknessLookupResult, UnlockResult,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';

// ============================================
// Node Lookup Helpers
// ============================================

function getNode(graph: KnowledgeGraph, id: string): KnowledgeNode | undefined {
  return graph.nodes.get(id);
}

function getDirectPrerequisites(graph: KnowledgeGraph, nodeId: string): string[] {
  const node = getNode(graph, nodeId);
  return node?.prerequisites ?? [];
}

function getDirectSuccessors(graph: KnowledgeGraph, nodeId: string): string[] {
  const node = getNode(graph, nodeId);
  return node?.successors ?? [];
}

// ============================================
// Transitive Closure Helpers
// ============================================

/** Get all prerequisites (direct + transitive) for a node */
export function getAllPrerequisites(graph: KnowledgeGraph, nodeId: string): string[] {
  const visited = new Set<string>();
  const queue = [...getDirectPrerequisites(graph, nodeId)];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...getDirectPrerequisites(graph, current));
  }

  return [...visited];
}

/** Get all successors (direct + transitive) for a node */
export function getAllSuccessors(graph: KnowledgeGraph, nodeId: string): string[] {
  const visited = new Set<string>();
  const queue = [...getDirectSuccessors(graph, nodeId)];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...getDirectSuccessors(graph, current));
  }

  return [...visited];
}

// ============================================
// Topological Sort (Kahn's Algorithm)
// ============================================

export function topologicalSort(graph: KnowledgeGraph, filterNodes?: Set<string>): TopologicalOrder {
  const nodeIds = filterNodes
    ? [...filterNodes].filter(id => graph.nodes.has(id))
    : [...graph.nodes.keys()];

  // Build in-degree map
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }
  for (const id of nodeIds) {
    const node = getNode(graph, id);
    if (!node) continue;
    for (const prereq of node.prerequisites) {
      if (nodeIds.includes(prereq)) {
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    // Sort for deterministic output
    queue.sort();
    const current = queue.shift()!;
    order.push(current);

    // Find all nodes that depend on `current` (i.e., have `current` as prerequisite)
    // Use the node's own successors field + scan all nodes for cross-skill references
    const dependents = new Set(getDirectSuccessors(graph, current));
    for (const [id, node] of graph.nodes) {
      if (nodeIds.includes(id) && node.prerequisites.includes(current)) {
        dependents.add(id);
      }
    }

    for (const dep of dependents) {
      if (!nodeIds.includes(dep)) continue;
      const newDegree = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, newDegree);
      if (newDegree === 0) {
        queue.push(dep);
      }
    }
  }

  // Cycle detection: if not all nodes processed, there's a cycle
  if (order.length !== nodeIds.length) {
    const processed = new Set(order);
    const cycleNodes = nodeIds.filter(id => !processed.has(id));
    return { order, hasCycle: true, cycleNodes };
  }

  return { order, hasCycle: false };
}

// ============================================
// Cycle Detection
// ============================================

export function hasCycle(graph: KnowledgeGraph): boolean {
  const result = topologicalSort(graph);
  return result.hasCycle;
}

export function findCycles(graph: KnowledgeGraph): string[][] {
  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const [id] of graph.nodes) {
    color.set(id, WHITE);
  }

  function dfs(nodeId: string): void {
    color.set(nodeId, GRAY);

    for (const succ of getDirectSuccessors(graph, nodeId)) {
      const succColor = color.get(succ);
      if (succColor === GRAY) {
        // Found cycle — backtrack
        const cycle: string[] = [succ];
        let current = nodeId;
        while (current !== succ) {
          cycle.push(current);
          current = parent.get(current) ?? '';
        }
        cycle.push(succ);
        cycles.push(cycle.reverse());
      } else if (succColor === WHITE) {
        parent.set(succ, nodeId);
        dfs(succ);
      }
    }

    color.set(nodeId, BLACK);
  }

  for (const [id, c] of color) {
    if (c === WHITE) dfs(id);
  }

  return cycles;
}

// ============================================
// Dependency Search
// ============================================

export function searchDependencies(graph: KnowledgeGraph, nodeId: string): DependencyResult | null {
  const node = getNode(graph, nodeId);
  if (!node) return null;

  const directPrerequisites = node.prerequisites;
  const directSuccessors = node.successors;
  const allPrerequisites = getAllPrerequisites(graph, nodeId);
  const allSuccessors = getAllSuccessors(graph, nodeId);

  // Calculate max depth of prerequisite tree
  let maxDepth = 0;
  function calcDepth(currentId: string, depth: number): void {
    maxDepth = Math.max(maxDepth, depth);
    for (const prereq of getDirectPrerequisites(graph, currentId)) {
      calcDepth(prereq, depth + 1);
    }
  }
  for (const prereq of directPrerequisites) {
    calcDepth(prereq, 1);
  }

  return {
    nodeId,
    allPrerequisites,
    allSuccessors,
    directPrerequisites,
    directSuccessors,
    maxDepth,
  };
}

// ============================================
// Shortest Learning Path (BFS)
// ============================================

export function shortestLearningPath(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string
): LearningPathResult {
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) {
    return { from: fromId, to: toId, path: [], totalEstimatedMinutes: 0, hops: 0, found: false };
  }

  if (fromId === toId) {
    const node = getNode(graph, fromId)!;
    return { from: fromId, to: toId, path: [fromId], totalEstimatedMinutes: node.estimatedLearningTime, hops: 0, found: true };
  }

  // BFS to find shortest path (since edges are unweighted or use estimatedLearningTime as weight)
  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue = [fromId];
  visited.add(fromId);

  let found = false;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) {
      found = true;
      break;
    }

    // Follow successors (forward edges)
    for (const succ of getDirectSuccessors(graph, current)) {
      if (!visited.has(succ)) {
        visited.add(succ);
        parent.set(succ, current);
        queue.push(succ);
      }
    }

    // Also follow prerequisites (backward edges) for bidirectional search
    for (const prereq of getDirectPrerequisites(graph, current)) {
      if (!visited.has(prereq)) {
        visited.add(prereq);
        parent.set(prereq, current);
        queue.push(prereq);
      }
    }
  }

  if (!found) {
    return { from: fromId, to: toId, path: [], totalEstimatedMinutes: 0, hops: 0, found: false };
  }

  // Reconstruct path
  const path: string[] = [];
  let current = toId;
  while (current !== fromId) {
    path.unshift(current);
    current = parent.get(current) ?? '';
  }
  path.unshift(fromId);

  // Calculate total time and hops
  let totalMinutes = 0;
  for (const id of path) {
    const node = getNode(graph, id);
    if (node) totalMinutes += node.estimatedLearningTime;
  }

  return {
    from: fromId,
    to: toId,
    path,
    totalEstimatedMinutes: totalMinutes,
    hops: path.length - 1,
    found: true,
  };
}

// ============================================
// Weakness Lookup
// ============================================

export interface MasteryData {
  nodeId: string;
  currentMastery: number;
}

export function lookupWeaknesses(
  graph: KnowledgeGraph,
  studentId: string,
  masteryData: MasteryData[],
  gradeLevel: string,
): WeaknessLookupResult {
  const masteryMap = new Map(masteryData.map(m => [m.nodeId, m.currentMastery]));

  const weakNodes: WeaknessLookupResult['weakNodes'] = [];
  const recommendedNodes: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    // Only consider nodes appropriate for student's grade level
    const gradeNum = parseInt(gradeLevel.replace('S', ''));
    const nodeGradeNum = parseInt(node.hkdseLevel.replace('S', ''));
    if (nodeGradeNum > gradeNum) continue;

    const currentMastery = masteryMap.get(nodeId) ?? 0;
    const threshold = node.masteryThreshold;
    const gap = threshold - currentMastery;

    if (currentMastery < threshold) {
      let urgency: WeaknessLookupResult['weakNodes'][0]['urgency'] = 'low';
      if (gap >= 40) urgency = 'critical';
      else if (gap >= 25) urgency = 'high';
      else if (gap >= 10) urgency = 'medium';

      weakNodes.push({
        nodeId,
        title: node.title,
        titleZh: node.titleZh,
        currentMastery,
        masteryThreshold: threshold,
        gap,
        urgency,
      });
    }
  }

  // Sort by urgency (critical first) then by gap (largest first)
  weakNodes.sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.gap - a.gap;
  });

  // Generate recommendations: top weaknesses whose prerequisites are mastered
  for (const weak of weakNodes) {
    const node = getNode(graph, weak.nodeId);
    if (!node) continue;

    const prereqsMastered = node.prerequisites.every(prereq => {
      const mastery = masteryMap.get(prereq) ?? 0;
      return mastery >= (getNode(graph, prereq)?.masteryThreshold ?? 70);
    });

    if (prereqsMastered && recommendedNodes.length < 5) {
      recommendedNodes.push(weak.nodeId);
    }
  }

  return {
    studentId,
    weakNodes,
    recommendedNodes,
  };
}

// ============================================
// Unlock Next Skill
// ============================================

export function unlockNextSkills(
  graph: KnowledgeGraph,
  studentId: string,
  masteryData: MasteryData[],
): UnlockResult {
  const masteryMap = new Map(masteryData.map(m => [m.nodeId, m.currentMastery]));

  // Determine mastered nodes
  const masteredNodes: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    const mastery = masteryMap.get(nodeId) ?? 0;
    if (mastery >= node.masteryThreshold) {
      masteredNodes.push(nodeId);
    }
  }

  const masteredSet = new Set(masteredNodes);
  const newlyUnlocked: UnlockResult['newlyUnlocked'] = [];
  const stillLocked: UnlockResult['stillLocked'] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (masteredSet.has(nodeId)) continue;

    const missingPrerequisites = node.prerequisites.filter(p => !masteredSet.has(p));

    if (missingPrerequisites.length === 0) {
      newlyUnlocked.push({
        nodeId,
        title: node.title,
        titleZh: node.titleZh,
        skill: node.skill,
        estimatedMinutes: node.estimatedLearningTime,
      });
    } else {
      stillLocked.push({
        nodeId,
        missingPrerequisites,
      });
    }
  }

  return {
    studentId,
    masteredNodes,
    newlyUnlocked,
    stillLocked,
  };
}

// ============================================
// Graph Statistics
// ============================================

export function getGraphStats(graph: KnowledgeGraph): {
  entryNodes: string[];
  leafNodes: string[];
  averagePrerequisites: number;
  maxPrerequisites: number;
  isolatedNodes: string[];
} {
  const entryNodes: string[] = [];
  const leafNodes: string[] = [];
  let totalPrereqs = 0;
  let maxPrereqs = 0;
  const nodeIds = new Set(graph.nodes.keys());
  const referencedAsPrereq = new Set<string>();
  const referencedAsSuccessor = new Set<string>();

  for (const [id, node] of graph.nodes) {
    totalPrereqs += node.prerequisites.length;
    maxPrereqs = Math.max(maxPrereqs, node.prerequisites.length);

    if (node.prerequisites.length === 0) entryNodes.push(id);
    if (node.successors.length === 0) leafNodes.push(id);

    for (const prereq of node.prerequisites) referencedAsPrereq.add(prereq);
    for (const succ of node.successors) referencedAsSuccessor.add(succ);
  }

  const isolatedNodes = entryNodes.filter(id => !referencedAsSuccessor.has(id));

  return {
    entryNodes,
    leafNodes,
    averagePrerequisites: graph.nodes.size > 0 ? Math.round((totalPrereqs / graph.nodes.size) * 10) / 10 : 0,
    maxPrerequisites: maxPrereqs,
    isolatedNodes,
  };
}
