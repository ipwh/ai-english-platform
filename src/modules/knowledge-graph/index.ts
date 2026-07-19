// Sprint 21: Knowledge Graph Engine — barrel exports
export type {
  KnowledgeNode, KnowledgeEdge, KnowledgeGraph, GraphMetadata,
  KnowledgeEdge as Edge,
  CEFRLevel, HKDSELevel,
  TopologicalOrder, DependencyResult, LearningPathResult,
  WeaknessLookupResult, UnlockResult,
  VisualNode, VisualEdge, VisualizationData,
  EdgeType,
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
