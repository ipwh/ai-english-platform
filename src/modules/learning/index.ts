// v4.1: LearningFacade — Unified entry point for ALL learning intelligence logic
// Design Rule #1: Every learning decision must be based on Student State.
// Design Rule #2: Recommendation is deterministic and explains WHY.
// Design Rule #4: Knowledge Graph contains only prerequisite relationships. No AI logic.
// Design Rule #5: Learning Science contains only learning algorithms. No API. No repositories.
// Design Rule #10: Architecture > features. Always prefer reuse over duplication.

// ============================================
// Engine (S39) — adaptive learning pipeline
// Sprint 64: LearningDecisionEngine is the canonical decision engine
// ============================================
import { executePipeline } from '@/modules/adaptive-learning/services/adaptive-learning-pipeline';
import { learningDecisionEngine, LearningDecisionEngine } from './decisions/LearningDecisionEngine';
export { executePipeline, learningDecisionEngine, LearningDecisionEngine };
export type { AdaptiveLearningResult, PipelineInput, PipelineStage } from '@/modules/adaptive-learning/types';

// Deprecated but kept for backward compat (wraps LearningDecisionEngine)
export { learningEngine, LearningEngine } from '@/modules/adaptive-learning/services/learning-engine';
export type { StrategyDecision, LearningEngineInput } from '@/modules/adaptive-learning/services/learning-engine';
export { buildDSEAdaptivePath } from '@/modules/adaptive-learning/services/dse-adaptive-path';
export type { AdaptivePath, PathNode } from '@/modules/adaptive-learning/services/dse-adaptive-path';

// Sprint 64: Canonical types
export type { LearningDecision } from './decisions/LearningDecision';
export { CANONICAL_DSE_WEIGHTS, getCanonicalDSEWeight, DECISION_WEIGHTS, createLearningDecision } from './decisions/LearningDecision';

// Sprint 65: Evidence-Based Learning
export { evidenceEvaluationService, EvidenceEvaluationService } from './decisions/EvidenceEvaluationService';
export type { LearningEvidence, LearningOutcome, EvidenceTimeline } from './decisions/LearningEvidence';
export { generateDecisionId, extractBaseline, extractOutcome } from './decisions/LearningEvidence';

// ============================================
// Recommendation (S33) — weighted 4-factor algorithm
// ============================================
import {
  getFullRecommendations,
  recommendGrammar,
  recommendVocabulary,
  recommendWritingTopic,
  recommendNextExercise,
} from '@/modules/recommendation/services/recommendation-engine';
export {
  getFullRecommendations,
  recommendGrammar,
  recommendVocabulary,
  recommendWritingTopic,
  recommendNextExercise,
};
export type {
  RecommendationResult,
  ScoredRecommendation,
  RecommendationCandidate,
} from '@/modules/recommendation/types';

// ============================================
// Knowledge Graph (S21/34) — 52-node prerequisite DAG
// ============================================
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
export { knowledgeGraphService };
import { knowledgeGraphRepo } from '@/modules/knowledge-graph/repositories/knowledge-graph-repository';
export { knowledgeGraphRepo };
import {
  topologicalSort,
  searchDependencies,
  shortestLearningPath,
  lookupWeaknesses,
  unlockNextSkills,
  getAllPrerequisites,
  getAllSuccessors,
} from '@/modules/knowledge-graph/services/dependency-resolver';
export {
  topologicalSort,
  searchDependencies,
  shortestLearningPath,
  lookupWeaknesses,
  unlockNextSkills,
  getAllPrerequisites,
  getAllSuccessors,
};
export type {
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeGraph,
  LearningPathResult,
} from '@/modules/knowledge-graph/types';

// ============================================
// Science (S33) — SM-2, Ebbinghaus, interleaving, confidence
// No API routes. No repositories. Algorithms only.
// ============================================
import {
  confidenceEstimator,
  difficultyAdjuster,
} from '@/modules/learning-science';
export {
  confidenceEstimator,
  difficultyAdjuster,
};

// ============================================
// Mistake Intelligence (S32) — longitudinal mistake patterns
// ============================================
import { buildWeaknessProfile } from '@/modules/mistake-intelligence/services/mistake-intelligence-service';
export { buildWeaknessProfile };
export type { WeaknessProfile, WeaknessItem } from '@/modules/mistake-intelligence/types';

// ============================================
// Unified Facade Object
// ============================================

/**
 * LearningFacade — v4.1
 *
 * ALL learning intelligence must be accessed through this facade.
 * Modules within the Learning domain should NOT call each other directly.
 *
 * Domains:
 *   Engine        — adaptive learning pipeline (S39)
 *   Recommendation — weighted recommendation algorithm (S33)
 *   KnowledgeGraph — prerequisite DAG, 52 nodes (S21/34)
 *   Science       — learning algorithms: SM-2, Ebbinghaus, confidence (S33)
 *   MistakeIntel  — longitudinal mistake analysis (S32)
 *
 * Cross-domain (allowed):
 *   Engine calls StudentFacade for mastery data
 *   Recommendation calls StudentFacade for mastery + MistakeIntel for weakness
 *
 * @example
 * import { LearningFacade } from '@/modules/learning';
 * const recs = await LearningFacade.getFullRecommendations(studentId);
 * const path = LearningFacade.shortestLearningPath(fromId, toId);
 */
export const LearningFacade = {
  // Engine
  engine: {
    execute: executePipeline,
  },

  // Recommendation
  recommendation: {
    getFull: getFullRecommendations,
    grammar: recommendGrammar,
    vocabulary: recommendVocabulary,
    writing: recommendWritingTopic,
    nextExercise: recommendNextExercise,
  },

  // Knowledge Graph
  knowledgeGraph: {
    service: knowledgeGraphService,
    repo: knowledgeGraphRepo,
    topologicalSort,
    searchDependencies,
    shortestLearningPath,
    lookupWeaknesses,
    unlockNextSkills,
    getAllPrerequisites,
    getAllSuccessors,
  },

  // Science (algorithms only)
  science: {
    confidence: confidenceEstimator,
    difficulty: difficultyAdjuster,
  },

  // Mistake Intelligence
  mistakeIntel: {
    buildProfile: buildWeaknessProfile,
  },
} as const;

// ============================================
// Overlap Analysis (Task 3)
// ============================================

/**
 * KNOWN OVERLAPS:
 *
 * 1. `learning/` (S7) vs `knowledge-graph/` (S21):
 *    - S7 has GRAMMAR_GRAPH (30 nodes) used as seed data by S21
 *    - S7 has topologicalSort, getDependents, getPrerequisites — all superseded
 *    - Migration: extract GRAMMAR_GRAPH into knowledge-graph/data/, then deprecate S7
 *
 * 2. `recommendation/` (S33): 4-factor weighted algorithm with DSE exam weights
 *
 * 3. `adaptive-learning/` (S39) vs `learning/` (S7):
 *    - Both are pipeline orchestrators
 *    - S7: weakness → learning path → recommendation
 *    - S39: mastery → mistakes → knowledge graph → recommendation → exercise
 *    - S39 supersedes S7 as the canonical pipeline
 *
 * CROSS-MODULE CALLS (to be migrated to LearningFacade):
 * - recommendation → student-mastery/repositories (should go through StudentFacade)
 * - recommendation → mistake-intelligence/repositories (should go through LearningFacade.mistakeIntel)
 * - adaptive-learning → student-mastery, mistake-intelligence, knowledge-graph (should go through facades)
 */
