// Sprint 76: AI Cache — thin wrapper over cache/cache-service (canonical cache implementation)
// AI-specific: SHA-256 key hashing, feature flag.
// All TTL/Map/eviction/cleanup logic lives in cache/cache-service.ts.
//
// 2026-09-15: Vercel KV backend removed (Vercel no longer used; @vercel/kv deprecated).
// Cache is in-memory per instance — acceptable for the current single-purpose cache;
// a shared backend (Redis/Memorystore) can be re-added behind this interface if needed.

import { logger } from '@/shared/logger/logger';
import { config } from '@/shared/config/config';
import { get as cacheGet, set as cacheSet, clearAll as cacheClear } from '@/modules/cache/cache-service';

function isEnabled(): boolean { return config.ai.cacheEnabled; }
function getTTL(): number { return config.ai.cacheTTLMs; }

async function hashKey(raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  let hashBuffer: ArrayBuffer;
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  } else {
    const nodeCrypto = await import('node:crypto');
    hashBuffer = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest().buffer;
  }
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'ai-cache:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export const aiCache = {
  async get(rawKey: string): Promise<string | null> {
    if (!isEnabled()) return null;
    try {
      const key = await hashKey(rawKey);
      const cached = cacheGet<{ value: string; expiresAt: number }>(key);
      if (!cached || Date.now() > cached.expiresAt) return null;
      logger.info({ module: 'ai-cache', hit: true, backend: 'memory' }, 'Cache hit');
      return cached.value;
    } catch (err) {
      logger.warn({ module: 'ai-cache', error: (err as Error).message }, 'Cache read failed');
      return null;
    }
  },

  async set(rawKey: string, value: string): Promise<void> {
    if (!isEnabled()) return;
    try {
      const key = await hashKey(rawKey);
      const ttl = getTTL();
      cacheSet(key, { value, expiresAt: Date.now() + ttl }, { namespace: 'ai:response', ttl: Math.ceil(ttl / 1000) });
    } catch (err) {
      logger.warn({ module: 'ai-cache', error: (err as Error).message }, 'Cache write failed');
    }
  },

  async clear(): Promise<void> {
    cacheClear();
  },

  stats(): { size: number; backend: string } {
    return { size: 0, backend: 'cache-module' };
  },
};
