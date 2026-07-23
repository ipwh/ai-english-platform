// Sprint 76: AI Cache — thin wrapper over cache/cache-service (canonical cache implementation)
// AI-specific: SHA-256 key hashing, Vercel KV backend, feature flag.
// All TTL/Map/eviction/cleanup logic lives in cache/cache-service.ts.

import { logger } from '@/shared/logger/logger';
import { getKvClient } from '@/shared/db/vercel-kv';
import { config } from '@/shared/config/config';
import { get as cacheGet, set as cacheSet, del as cacheDel, clearAll as cacheClear } from '@/modules/cache/cache-service';

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
      const kv = await getKvClient();
      if (kv) {
        const raw = await kv.get(key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as { value: string; expiresAt: number };
        if (Date.now() > entry.expiresAt) return null;
        logger.info({ module: 'ai-cache', hit: true, backend: 'kv' }, 'Cache hit');
        return entry.value;
      }
      // Delegate to canonical cache module
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
      const kv = await getKvClient();
      if (kv) { await kv.set(key, JSON.stringify({ value, expiresAt: Date.now() + ttl }), { ex: Math.ceil(ttl / 1000) }); return; }
      cacheSet(key, { value, expiresAt: Date.now() + ttl }, { namespace: 'ai:response', ttl: Math.ceil(ttl / 1000) });
    } catch (err) {
      logger.warn({ module: 'ai-cache', error: (err as Error).message }, 'Cache write failed');
    }
  },

  async clear(): Promise<void> {
    cacheClear();
    const kv = await getKvClient();
    if (kv) logger.warn({ module: 'ai-cache' }, 'Vercel KV clear not supported automatically');
  },

  stats(): { size: number; backend: string } {
    return { size: 0, backend: process.env.VERCEL_KV_URL ? 'vercel-kv' : 'cache-module' };
  },
};
