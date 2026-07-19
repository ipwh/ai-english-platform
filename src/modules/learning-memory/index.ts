// Sprint 25: Long-term Learning Memory — barrel exports
export type {
  LearningMemory, LearningContext,
  GrammarMemory, VocabularyMemory, WritingStyleMemory,
  ReadingPreferenceMemory, LearningSpeedMemory,
  PreferredTopicsMemory, WeaknessMemory, StrengthMemory,
  RecentErrorsMemory, ReviewHistoryMemory,
} from './types';

export { memoryService, createEmptyMemory } from './services/memory-service';
export { memoryRepo } from './repositories/memory-repository';
export {
  decayScore, recencyScore, weaknessSeverity, strengthConfidence,
  generateLearningContext, shouldUpdateMemory, calculateMemoryFreshness,
  estimateMemorySize,
} from './services/memory-scoring';
