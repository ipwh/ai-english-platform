// Sprint 25: Long-term Learning Memory — barrel exports
// Sprint 36: Memory v2 — extended exports
export type {
  LearningMemory, LearningContext,
  GrammarMemory, VocabularyMemory, WritingStyleMemory,
  ReadingPreferenceMemory, LearningSpeedMemory,
  PreferredTopicsMemory, WeaknessMemory, StrengthMemory,
  RecentErrorsMemory, ReviewHistoryMemory,
  // Sprint 36 types
  ConfidenceMemory, MotivationMemory, LearningHabitsMemory,
  LearningMemoryV2, MemoryProfile, MemoryInfluence,
  DecayResult, RefreshResult,
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

// Sprint 36: v2 exports
export { MemoryEngine, memoryEngine } from './services/memory-engine';
export { MemoryProfileGenerator, memoryProfileGenerator } from './services/memory-profile';
export { MemoryInfluenceEngine, memoryInfluenceEngine } from './services/memory-influence';
