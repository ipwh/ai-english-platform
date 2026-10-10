// Sprint 12: Cache Service — in-memory TTL cache with Redis-compatible interface
import type { CacheEntry, CacheNamespace, CacheOptions, CacheStats } from './types';
import { logger } from '@/shared/logger/logger';

const store = new Map<string, CacheEntry<unknown>>();
const hitCounts = new Map<CacheNamespace, number>();
const missCounts = new Map<CacheNamespace, number>();

let pruneInterval: ReturnType<typeof setInterval> | null = null;

// ============================================
// Core Operations
// ============================================

/** Get a cached value. Returns undefined if missing or expired. */
export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) {
    missCounts.set('ai:response' as CacheNamespace, (missCounts.get('ai:response') ?? 0) + 1);
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    missCounts.set(entry.namespace, (missCounts.get(entry.namespace) ?? 0) + 1);
    return undefined;
  }
  entry.hits++;
  hitCounts.set(entry.namespace, (hitCounts.get(entry.namespace) ?? 0) + 1);
  return entry.value as T;
}

/** Set a cached value with TTL */
export function set<T>(key: string, value: T, options: CacheOptions): void {
  const ttl = options.ttl ?? 3600; // Default 1 hour
  store.set(key, {
    value,
    expiresAt: Date.now() + ttl * 1000,
    createdAt: Date.now(),
    namespace: options.namespace,
    hits: 0,
  });
}

/** Delete a cached entry */
export function del(key: string): boolean {
  return store.delete(key);
}

/** Check if a key exists and is not expired */
export function has(key: string): boolean {
  const entry = store.get(key);
  return !!entry && Date.now() <= entry.expiresAt;
}

/** Get TTL remaining in seconds. -1 if not found, -2 if no TTL. */
export function ttl(key: string): number {
  const entry = store.get(key);
  if (!entry) return -1;
  const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : -1;
}

/** Delete all entries in a namespace */
export function clearNamespace(namespace: CacheNamespace): number {
  let count = 0;
  for (const [key, entry] of store) {
    if (entry.namespace === namespace) {
      store.delete(key);
      count++;
    }
  }
  return count;
}

/** Clear all cache entries and reset stats */
export function clearAll(): void {
  store.clear();
  hitCounts.clear();
  missCounts.clear();
}

// ============================================
// Cache-aside pattern: get or compute
// ============================================

/**
 * Get from cache, or compute and store.
 * Standard cache-aside pattern: cache hit → return, cache miss → compute → store → return.
 */
export async function getOrCompute<T>(
  key: string,
  options: CacheOptions,
  compute: () => Promise<T>
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== undefined) {
    logger.debug({ module: 'cache', key, namespace: options.namespace, hit: true }, 'Cache hit');
    return cached;
  }

  logger.debug({ module: 'cache', key, namespace: options.namespace, hit: false }, 'Cache miss');
  const value = await compute();
  set(key, value, options);
  return value;
}

// ============================================
// Statistics
// ============================================

export function getStats(): CacheStats {
  let totalHits = 0, totalMisses = 0, expired = 0;
  const byNs: Record<string, { entries: number; hits: number }> = {};
  const now = Date.now();

  for (const [, entry] of store) {
    const ns = entry.namespace;
    if (!byNs[ns]) byNs[ns] = { entries: 0, hits: 0 };
    byNs[ns].entries++;
    byNs[ns].hits += entry.hits;
    if (now > entry.expiresAt) expired++;
  }

  for (const [, h] of hitCounts) totalHits += h;
  for (const [, m] of missCounts) totalMisses += m;

  return {
    entries: store.size,
    hits: totalHits,
    misses: totalMisses,
    hitRate: totalHits + totalMisses > 0 ? Math.round((totalHits / (totalHits + totalMisses)) * 100) / 100 : 0,
    expiredCount: expired,
    byNamespace: byNs,
  };
}

// ============================================
// Auto-pruning (background cleanup)
// ============================================

/** Start background pruning of expired entries every N seconds */
export function startPruning(intervalSeconds = 300): void {
  if (pruneInterval) return;
  pruneInterval = setInterval(() => {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) { store.delete(key); pruned++; }
    }
    if (pruned > 0) logger.debug({ module: 'cache', pruned }, 'Cache pruned');
  }, intervalSeconds * 1000);
}

/** Stop background pruning */
export function stopPruning(): void {
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
}

// ============================================
// Service object — v4.2 convenience wrapper for facade
// ============================================

export const cacheService = {
  get,
  set,
  del,
  has,
  ttl,
  getOrCompute,
  clearNamespace,
  clearAll,
  getStats,
  startPruning,
  stopPruning,
};
