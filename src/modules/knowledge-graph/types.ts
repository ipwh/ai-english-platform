// Sprint 21: Knowledge Graph Engine — types
// Builds on top of learning module SkillNode, extends with full curriculum data

import type { SkillDimension } from '@/modules/student/profile/types';

// ============================================
// CEFR Levels (Common European Framework)
// ============================================

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// ============================================
// HKDSE Grade Levels
// ============================================

export type HKDSELevel = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

// ============================================
// KnowledgeNode — core unit of the learning graph
// ============================================

export interface KnowledgeNode {
  /** Unique skill identifier (e.g. 'tenses-simple', 'essay-structure') */
  id: string;
  /** English title */
  title: string;
  /** Chinese title */
  titleZh: string;
  /** Primary skill dimension */
  skill: SkillDimension;
  /** Difficulty rating 1-5 (1=easiest, 5=hardest within HKDSE context) */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** CEFR level alignment */
  cefr: CEFRLevel;
  /** HKDSE grade level where this skill is typically introduced */
  hkdseLevel: HKDSELevel;
  /** Estimated learning time in minutes */
  estimatedLearningTime: number;
  /** Score threshold (0-100) to consider this node "mastered" */
  masteryThreshold: number;
  /** Prerequisite node IDs — must be mastered before this node unlocks */
  prerequisites: string[];
  /** Successor node IDs — nodes that depend on this one (reverse edges) */
  successors: string[];
  /** Specific learning objectives (English) */
  learningObjectives: string[];
  /** Specific learning objectives (Chinese) */
  learningObjectivesZh: string[];
  /** Common mistakes students make for this skill */
  commonMistakes: Array<{
    description: string;
    descriptionZh: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  /** Example questions to test this skill */
  exampleQuestions: Array<{
    question: string;
    questionZh: string;
    answer: string;
    explanation: string;
  }>;
  /** Tags for categorization and search */
  tags: string[];
  // === Sprint 34: Knowledge Graph v2 fields ===
  /** Forgetting curve weight (0-1) — how fast this skill decays without practice */
  forgettingWeight?: number;
  /** Importance weight (0-1) — how critical this skill is for DSE exam */
  importanceWeight?: number;
  /** Recommended exercise types for this skill */
  recommendedExercises?: string[];
}

// ============================================
// KnowledgeEdge — directed relationship between nodes
// ============================================

export type EdgeType = 'prerequisite' | 'reinforcement' | 'related' | 'extension';

export interface KnowledgeEdge {
  /** Unique edge ID */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Relationship type */
  type: EdgeType;
  /** Optional weight (relevance strength 0-1) */
  weight?: number;
  /** Human-readable label */
  label?: string;
}

// ============================================
// KnowledgeGraph — the full graph data structure
// ============================================

export interface KnowledgeGraph {
  /** All nodes indexed by ID */
  nodes: Map<string, KnowledgeNode>;
  /** All edges */
  edges: KnowledgeEdge[];
  /** Graph metadata */
  metadata: GraphMetadata;
}

export interface GraphMetadata {
  /** Total node count */
  totalNodes: number;
  /** Total edge count */
  totalEdges: number;
  /** Nodes per skill dimension */
  nodesPerSkill: Record<SkillDimension, number>;
  /** Nodes per CEFR level */
  nodesPerCefr: Record<CEFRLevel, number>;
  /** Nodes per HKDSE level */
  nodesPerHkdse: Record<HKDSELevel, number>;
  /** Graph version for cache invalidation */
  version: string;
  /** Last updated timestamp */
  lastUpdated: Date;
}

// ============================================
// Graph Algorithm Results
// ============================================

/** Result of a topological sort */
export interface TopologicalOrder {
  /** Ordered node IDs */
  order: string[];
  /** Whether the graph had cycles (invalid for DAG operations) */
  hasCycle: boolean;
  /** If hasCycle, the nodes involved */
  cycleNodes?: string[];
}

/** Result of a dependency search */
export interface DependencyResult {
  /** The requested node */
  nodeId: string;
  /** All prerequisite nodes (direct and transitive) */
  allPrerequisites: string[];
  /** All successor nodes (direct and transitive) */
  allSuccessors: string[];
  /** Direct prerequisites only */
  directPrerequisites: string[];
  /** Direct successors only */
  directSuccessors: string[];
  /** Prerequisite tree depth */
  maxDepth: number;
}

/** Result of a shortest learning path query */
export interface LearningPathResult {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Ordered path of node IDs */
  path: string[];
  /** Total estimated learning time in minutes */
  totalEstimatedMinutes: number;
  /** Number of hops */
  hops: number;
  /** Whether a path was found */
  found: boolean;
}

/** Result of a weakness lookup */
export interface WeaknessLookupResult {
  /** Student ID */
  studentId: string;
  /** Nodes where student is below mastery threshold */
  weakNodes: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    currentMastery: number;
    masteryThreshold: number;
    gap: number;
    urgency: 'critical' | 'high' | 'medium' | 'low';
  }>;
  /** Recommended next nodes to study */
  recommendedNodes: string[];
}

/** Result of unlock next skill query */
export interface UnlockResult {
  /** Student ID */
  studentId: string;
  /** Nodes the student has mastered */
  masteredNodes: string[];
  /** Nodes that are now unlocked (all prerequisites mastered) */
  newlyUnlocked: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    skill: SkillDimension;
    estimatedMinutes: number;
  }>;
  /** Nodes still locked */
  stillLocked: Array<{
    nodeId: string;
    missingPrerequisites: string[];
  }>;
}

// ============================================
// Visualization types (React Flow compatible)
// ============================================

export interface VisualNode {
  id: string;
  type: 'knowledgeNode';
  position: { x: number; y: number };
  data: {
    label: string;
    labelZh: string;
    skill: SkillDimension;
    difficulty: number;
    cefr: CEFRLevel;
    hkdseLevel: HKDSELevel;
    isMastered?: boolean;
    masteryScore?: number;
    isUnlocked?: boolean;
    isRecommended?: boolean;
  };
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  type?: 'smoothstep' | 'straight' | 'step';
  animated?: boolean;
  style?: Record<string, string | number>;
  data?: {
    label?: string;
    type: EdgeType;
  };
}

export interface VisualizationData {
  nodes: VisualNode[];
  edges: VisualEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    layoutAlgorithm: 'layered' | 'force' | 'radial';
  };
}

// ============================================
// Sprint 34: Knowledge Graph v2 types
// ============================================

/** Traversal strategy */
export type TraversalStrategy = 'dfs' | 'bfs' | 'topological' | 'importance-first' | 'weakness-first';

/** Traversal result */
export interface TraversalResult {
  /** Ordered node IDs visited */
  path: string[];
  /** Nodes visited count */
  visitedCount: number;
  /** Strategy used */
  strategy: TraversalStrategy;
  /** Total estimated time for all visited nodes (minutes) */
  totalEstimatedMinutes: number;
}

/** Multi-criteria learning path */
export interface GeneratedLearningPath {
  /** Unique path ID */
  id: string;
  /** Ordered list of node IDs to study */
  nodes: string[];
  /** Path metadata per node */
  nodeDetails: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    estimatedMinutes: number;
    currentMastery?: number;
    isMastered?: boolean;
    isWeakness?: boolean;
  }>;
  /** Total time in minutes */
  totalTimeMinutes: number;
  /** Path generation strategy */
  strategy: 'shortest-time' | 'highest-importance' | 'weakness-first' | 'balanced' | 'exam-prep';
  /** Why this path was chosen */
  rationale: string;
  rationaleZh: string;
}

/** Enhanced weakness detection with forgetting integration */
export interface EnhancedWeaknessResult {
  studentId: string;
  generatedAt: string;
  weaknesses: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    skill: string;
    currentMastery: number;
    masteryThreshold: number;
    masteryGap: number;
    forgettingWeight: number;
    importanceWeight: number;
    /** Composite urgency score (0-1) */
    urgencyScore: number;
    urgency: 'critical' | 'high' | 'medium' | 'low';
    /** Estimated time to fix (minutes) */
    estimatedFixTime: number;
    /** Prerequisites that are also weak */
    weakPrerequisites: string[];
    /** Recommended exercises */
    recommendedExercises: string[];
  }>;
  /** Skill-level summary */
  skillBreakdown: Array<{
    skill: string;
    weakCount: number;
    averageGap: number;
  }>;
  /** Urgent items needing immediate attention */
  criticalItems: string[];
}

/** Learning gap: what student should know vs what they actually know */
export interface LearningGapResult {
  studentId: string;
  gradeLevel: string;
  /** Expected nodes based on grade level + CEFR alignment */
  expectedNodes: string[];
  /** Nodes the student has actually mastered */
  masteredNodes: string[];
  /** Nodes that are expected but not mastered (the gaps) */
  gapNodes: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    skill: string;
    importanceWeight: number;
    /** How many days behind schedule */
    estimatedDaysBehind: number;
  }>;
  /** Overall gap severity */
  severity: 'none' | 'minor' | 'moderate' | 'severe';
  /** Recommended catch-up plan */
  catchUpPlan: string[];
  catchUpPlanZh: string[];
}

/** Next skill prediction */
export interface NextSkillPrediction {
  studentId: string;
  /** Top 5 recommended next skills with confidence scores */
  predictions: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    /** 0-1 confidence that this is the right next skill */
    confidence: number;
    reason: string;
    reasonZh: string;
  }>;
  /** Whether student is ready to advance (all current-level nodes mastered) */
  readyToAdvance: boolean;
  /** Suggested CEFR level to target next */
  suggestedCefrLevel: string;
}

/** Bottleneck detection — nodes blocking many successors */
export interface BottleneckResult {
  /** Bottleneck nodes sorted by impact */
  bottlenecks: Array<{
    nodeId: string;
    title: string;
    titleZh: string;
    /** Number of successor nodes blocked */
    blocksCount: number;
    /** Blocked node IDs */
    blockedNodes: string[];
    /** Total estimated time of blocked content (minutes) */
    blockedContentMinutes: number;
  }>;
  /** The single most impactful node to master */
  highestImpact: string | null;
}
