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
  persistMemoryToDb, loadMemoryFromDb, deleteMemoryFromDb,
  initMemoryPersistence, loadAllMemoriesFromDb,
} from './repositories/memory-db-repository';
export {
  decayScore, recencyScore, weaknessSeverity, strengthConfidence,
  generateLearningContext, shouldUpdateMemory, calculateMemoryFreshness,
  estimateMemorySize,
} from './services/memory-scoring';
export {
  getMemoryContext, enrichSystemPrompt, getMemorySummary, recordAiInteraction,
} from './services/ai-memory-integration';
