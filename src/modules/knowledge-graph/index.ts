// Sprint 21: Knowledge Graph Engine — barrel exports
// Sprint 34: Knowledge Graph v2 — extended exports
export type {
  KnowledgeNode, KnowledgeEdge, KnowledgeGraph, GraphMetadata,
  KnowledgeEdge as Edge,
  CEFRLevel, HKDSELevel,
  TopologicalOrder, DependencyResult, LearningPathResult,
  WeaknessLookupResult, UnlockResult,
  VisualNode, VisualEdge, VisualizationData,
  EdgeType,
  // Sprint 34 types
  TraversalStrategy, TraversalResult,
  GeneratedLearningPath,
  EnhancedWeaknessResult, LearningGapResult,
  NextSkillPrediction, BottleneckResult,
} from './types';

export { buildFullKnowledgeGraph, getKnowledgeGraph, invalidateGraphCache, CEFR_TO_HKDSE, HKDSE_TO_CEFR } from './services/knowledge-graph';
export {
  topologicalSort, searchDependencies, shortestLearningPath,
  lookupWeaknesses, unlockNextSkills, hasCycle, findCycles,
  getGraphStats, getAllPrerequisites, getAllSuccessors,
} from './services/dependency-resolver';
export type { MasteryData } from './services/dependency-resolver';

export { knowledgeGraphService } from './services/knowledge-graph-service';
export { knowledgeGraphRepo } from './repositories/knowledge-graph-repository';
export {
  generateVisualization, generatePathVisualization, generateLegend,
} from './services/visualization';
export type { VisualizationOptions } from './services/visualization';

// Sprint 34: v2 exports
export { KnowledgeTraversalService, knowledgeTraversalService } from './services/traversal-service';
export { LearningPathGenerator, learningPathGenerator } from './services/learning-path-generator';
export { WeaknessLocator, weaknessLocator } from './services/weakness-locator';
export { SkillDependencyResolver, skillDependencyResolver } from './services/skill-dependency-resolver';
