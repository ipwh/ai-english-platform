// v4.1: LearningFacade — Unified entry point for ALL learning intelligence logic
// Design Rule #1: Every learning decision must be based on Student State.
// Design Rule #2: Recommendation is deterministic and explains WHY.
// Design Rule #4: Knowledge Graph contains only prerequisite relationships. No AI logic.
// Design Rule #5: Learning Science contains only learning algorithms. No API. No repositories.
// Design Rule #10: Architecture > features. Always prefer reuse over duplication.

// ============================================
// Engine (S39) — adaptive learning pipeline
// ============================================
export { executePipeline } from '@/modules/adaptive-learning/services/adaptive-learning-pipeline';
export type { AdaptiveLearningResult, PipelineInput, PipelineStage } from '@/modules/adaptive-learning/types';

// ============================================
// Recommendation (S33) — weighted 4-factor algorithm
// ============================================
export {
  getFullRecommendations,
  recommendGrammar,
  recommendVocabulary,
  recommendWritingTopic,
  recommendNextExercise,
} from '@/modules/recommendation-v2/services/recommendation-engine';
export type {
  RecommendationResult,
  ScoredRecommendation,
  RecommendationCandidate,
} from '@/modules/recommendation-v2/types';

// ============================================
// Knowledge Graph (S21/34) — 52-node prerequisite DAG
// ============================================
export { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
export { knowledgeGraphRepo } from '@/modules/knowledge-graph/repositories/knowledge-graph-repository';
export {
  topologicalSort,
  searchDependencies,
  shortestLearningPath,
  lookupWeaknesses,
  unlockNextSkills,
  getAllPrerequisites,
  getAllSuccessors,
} from '@/modules/knowledge-graph/services/dependency-resolver';
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
export {
  confidenceEstimator,
  difficultyAdjuster,
} from '@/modules/learning-science/services';

// ============================================
// Mistake Intelligence (S32) — longitudinal mistake patterns
// ============================================
export { buildWeaknessProfile } from '@/modules/mistake-intelligence/services/mistake-intelligence-service';
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
 * 2. `recommendation/` (v1) vs `recommendation-v2/` (S33):
 *    - v1 has 8 strategies with knowledge-graph integration
 *    - v2 has 4-factor weighted algorithm with DSE exam weights
 *    - Both are active — v1 (LLM-based recommendations), v2 (deterministic scoring)
 *    - v2 is the LearningFacade default; v1 remains for LLM-based paths
 *
 * 3. `adaptive-learning/` (S39) vs `learning/` (S7):
 *    - Both are pipeline orchestrators
 *    - S7: weakness → learning path → recommendation
 *    - S39: mastery → mistakes → knowledge graph → recommendation → exercise
 *    - S39 supersedes S7 as the canonical pipeline
 *
 * CROSS-MODULE CALLS (to be migrated to LearningFacade):
 * - recommendation-v2 → student-mastery/repositories (should go through StudentFacade)
 * - recommendation-v2 → mistake-intelligence/repositories (should go through LearningFacade.mistakeIntel)
 * - adaptive-learning → student-mastery, mistake-intelligence, knowledge-graph (should go through facades)
 */
