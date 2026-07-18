// Sprint 12: Cache — barrel
export type { CacheEntry, CacheNamespace, CacheOptions, CacheStats } from './types';
export { get, set, del, has, ttl, getOrCompute, clearNamespace, clearAll, getStats, startPruning, stopPruning } from './cache-service';
export { grammarKeys, vocabKeys, readingKeys, exerciseKeys, essayKeys, aiKeys, profileKeys } from './cache-keys';
