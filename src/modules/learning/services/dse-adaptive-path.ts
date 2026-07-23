// v5: DSE Adaptive Learning Path
// Ranks topics by: DSE exam importance × current mastery × forgetting state
// Produces a personalized study sequence optimized for exam performance.

import type { KnowledgeNode } from '@/modules/knowledge-graph/types';
import { CANONICAL_DSE_WEIGHTS, getCanonicalDSEWeight } from '@/modules/learning/decisions/LearningDecision';

// ============================================
// DSE Exam Importance Weights
// Sprint 71: Re-exports from CANONICAL_DSE_WEIGHTS (single source of truth)
// ============================================

export { CANONICAL_DSE_WEIGHTS as DSE_TOPIC_WEIGHTS };

/** @deprecated Use getCanonicalDSEWeight from '@/modules/learning/decisions/LearningDecision' */
export const getDSEWeight = getCanonicalDSEWeight;

// ============================================
// Learning Path Types
// ============================================

export interface PathNode {
  /** Knowledge node reference */
  node: KnowledgeNode;
  /** DSE exam importance (0-1) */
  dseWeight: number;
  /** Current mastery (0-100) — lower = higher priority */
  masteryScore: number;
  /** Retention probability (0-1) — lower = needs review */
  retentionProbability: number;
  /** Days since last practice */
  daysSinceLastPractice: number;
  /** Computed priority score (higher = more urgent) */
  priorityScore: number;
  /** Recommended action */
  action: 'learn' | 'review' | 'reinforce' | 'master';
  /** Estimated sessions needed */
  estimatedSessions: number;
}

export interface AdaptivePath {
  studentId: string;
  generatedAt: string;
  targetDseLevel: string;
  /** All topics ranked by priority */
  path: PathNode[];
  /** Top 5 urgent topics */
  urgentTopics: PathNode[];
  /** Next 10 recommended topics */
  nextUpTopics: PathNode[];
  /** Topics to maintain (good mastery, but watch retention) */
  maintainTopics: PathNode[];
  /** Estimated weeks to complete the path */
  estimatedWeeks: number;
}

// ============================================
// Priority Scoring Algorithm
// ============================================

const PRIORITY_WEIGHTS = {
  DSE_IMPORTANCE: 0.35,  // How critical for the exam
  MASTERY_GAP: 0.30,     // How far from mastery (100 - current)
  RETENTION_RISK: 0.25,  // How likely to forget soon (1 - retention)
  RECENCY: 0.10,         // How long since last practiced
};

/**
 * Build a personalized DSE adaptive learning path.
 * This is PURELY deterministic — no AI, no LLM.
 */
export function buildDSEAdaptivePath(input: {
  studentId: string;
  targetLevel: string;
  knowledgeNodes: KnowledgeNode[];
  mastery: Record<string, number>;
  retention: Record<string, number>;
  daysSinceLastPractice: Record<string, number>;
}): AdaptivePath {
  const { studentId, targetLevel, knowledgeNodes, mastery, retention, daysSinceLastPractice } = input;

  const pathNodes: PathNode[] = [];

  for (const node of knowledgeNodes) {
    const dseWeight = getDSEWeight(node.id);
    const masteryScore = mastery[node.id] ?? 30;
    const retentionProb = retention[node.id] ?? 0.5;
    const daysSinceLast = daysSinceLastPractice[node.id] ?? 7;

    // Skip already-mastered nodes (unless retention is dropping)
    if (masteryScore >= node.masteryThreshold && retentionProb > 0.8) continue;

    const masteryGap = Math.max(0, node.masteryThreshold - masteryScore) / 100;
    const retentionRisk = 1 - retentionProb;
    const recencyFactor = Math.min(1, daysSinceLast / 30);

    const priorityScore =
      dseWeight * PRIORITY_WEIGHTS.DSE_IMPORTANCE +
      masteryGap * PRIORITY_WEIGHTS.MASTERY_GAP +
      retentionRisk * PRIORITY_WEIGHTS.RETENTION_RISK +
      recencyFactor * PRIORITY_WEIGHTS.RECENCY;

    const action: PathNode['action'] =
      masteryScore < 30 ? 'learn' :
      retentionProb < 0.4 ? 'review' :
      masteryScore < node.masteryThreshold ? 'reinforce' : 'master';

    const estimatedSessions = Math.max(1, Math.ceil(
      (node.masteryThreshold - masteryScore) / 15 * (1 / Math.max(0.1, retentionProb))
    ));

    pathNodes.push({
      node,
      dseWeight,
      masteryScore,
      retentionProbability: retentionProb,
      daysSinceLastPractice: daysSinceLast,
      priorityScore,
      action,
      estimatedSessions,
    });
  }

  // Sort by priority (highest first)
  pathNodes.sort((a, b) => b.priorityScore - a.priorityScore);

  const totalSessions = pathNodes.reduce((s, n) => s + n.estimatedSessions, 0);
  const estimatedWeeks = Math.ceil(totalSessions / 5); // 5 sessions per week assumption

  return {
    studentId,
    generatedAt: new Date().toISOString(),
    targetDseLevel: targetLevel,
    path: pathNodes,
    urgentTopics: pathNodes.filter(n => n.priorityScore > 0.6).slice(0, 5),
    nextUpTopics: pathNodes.filter(n => n.priorityScore > 0.3 && n.priorityScore <= 0.6).slice(0, 10),
    maintainTopics: pathNodes.filter(n => n.action === 'master' || n.action === 'reinforce').slice(0, 10),
    estimatedWeeks,
  };
}
