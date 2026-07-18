// Sprint 12: Cache — types

export type CacheNamespace =
  | 'grammar:explanation'
  | 'vocabulary:analysis'
  | 'reading:passage'
  | 'exercise:generated'
  | 'essay:feedback'
  | 'ai:response'
  | 'profile:student';

export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // Unix timestamp in ms
  createdAt: number;
  namespace: CacheNamespace;
  hits: number;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  expiredCount: number;
  byNamespace: Record<string, { entries: number; hits: number }>;
}

export interface CacheOptions {
  /** TTL in seconds (default: 3600 = 1 hour) */
  ttl?: number;
  /** Namespace for key organization */
  namespace: CacheNamespace;
}
