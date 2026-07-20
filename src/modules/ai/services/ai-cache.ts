// ============================================
// AI 回應快取 — 降低 AI API 費用與延遲
//
// 策略：
//   - 對相同 prompt + 參數的請求快取結果
//   - 開發環境：in-memory Map（跨請求共享）
//   - 生產環境：Vercel KV（跨 instance 共享）
//   - TTL 預設 1 小時（可透過 AI_CACHE_TTL_MS 設定）
//   - 可透過 AI_CACHE_ENABLED=false 全域停用
//
// 使用方式：
//   import { aiCache } from '@/modules/ai/services/ai-cache';
//   const cached = await aiCache.get(key);
//   if (cached) return cached;
//   const result = await callLLM(...);
//   await aiCache.set(key, result);
// ============================================

import { logger } from '@/shared/logger/logger';
import { getKvClient } from '@/shared/db/vercel-kv';
import { config } from '@/shared/config/config';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const inMemoryStore = new Map<string, CacheEntry>();

function isEnabled(): boolean {
  return config.ai.cacheEnabled;
}

function getTTL(): number {
  return config.ai.cacheTTLMs;
}

/**
 * 產生快取 key（基於 SHA-256 hash 確保長度可控）
 * 自動偵測 Edge (Web Crypto) vs Node.js (crypto 模組)
 */
async function hashKey(raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  let hashBuffer: ArrayBuffer;
  // Edge Runtime / modern browsers — Web Crypto API
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  } else {
    // Node.js fallback (local dev, tests)
    const nodeCrypto = await import('node:crypto');
    hashBuffer = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest().buffer;
  }
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'ai-cache:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * AI 快取介面
 */
export const aiCache = {
  /**
   * 嘗試從快取取得 AI 回應
   * @returns 快取的內容，或 null（未命中）
   */
  async get(rawKey: string): Promise<string | null> {
    if (!isEnabled()) return null;

    try {
      const key = await hashKey(rawKey);
      const kv = await getKvClient();

      if (kv) {
        const raw = await kv.get(key);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) return null;
        logger.info({ module: 'ai-cache', hit: true, backend: 'kv' }, 'Cache hit');
        return entry.value;
      }

      // In-memory fallback
      const entry = inMemoryStore.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        inMemoryStore.delete(key);
        return null;
      }
      logger.info({ module: 'ai-cache', hit: true, backend: 'memory' }, 'Cache hit');
      return entry.value;
    } catch (err) {
      logger.warn({ module: 'ai-cache', error: (err as Error).message }, 'Cache read failed, skipping');
      return null;
    }
  },

  /**
   * 將 AI 回應存入快取
   */
  async set(rawKey: string, value: string): Promise<void> {
    if (!isEnabled()) return;

    try {
      const key = await hashKey(rawKey);
      const ttl = getTTL();
      const entry: CacheEntry = { value, expiresAt: Date.now() + ttl };
      const kv = await getKvClient();

      if (kv) {
        await kv.set(key, JSON.stringify(entry), { ex: Math.ceil(ttl / 1000) });
        return;
      }

      inMemoryStore.set(key, entry);

      // 被動清理過期條目（in-memory only）
      if (inMemoryStore.size > 500) {
        const now = Date.now();
        for (const [k, v] of inMemoryStore) {
          if (now > v.expiresAt) inMemoryStore.delete(k);
        }
      }
    } catch (err) {
      logger.warn({ module: 'ai-cache', error: (err as Error).message }, 'Cache write failed, skipping');
    }
  },

  /**
   * 清除所有快取（用於測試或手動重置）
   */
  async clear(): Promise<void> {
    inMemoryStore.clear();
    const kv = await getKvClient();
    if (kv) {
      logger.warn({ module: 'ai-cache' }, 'Vercel KV clear not supported automatically — use Vercel Dashboard');
    }
  },

  /**
   * 取得快取統計
   */
  stats(): { size: number; backend: string } {
    return {
      size: inMemoryStore.size,
      backend: process.env.VERCEL_KV_URL ? 'vercel-kv' : 'in-memory',
    };
  },
};

/** 定期清理過期 in-memory 條目（每 5 分鐘） */
// Module-level cache pruning — persists for application lifetime, no cleanup needed
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore) {
      if (now > entry.expiresAt) inMemoryStore.delete(key);
    }
  }, 300_000);
}
