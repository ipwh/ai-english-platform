// ============================================
// Vercel KV Abstraction — 統一 KV 客戶端初始化
// 取代在 ai-cache.ts / rate-limiter.ts 中的重複 getKvClient() 實作
// ============================================

import { logger } from '@/shared/logger/logger';

type KvClient = {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, opts: { ex: number }) => Promise<void>;
};

let kvClient: KvClient | null = null;
let kvInitAttempted = false;
let activeBackend: 'kv' | 'memory' = 'memory';

/** 嘗試初始化 Vercel KV — 需 `@vercel/kv` 已安裝且 `VERCEL_KV_URL` + `VERCEL_KV_TOKEN` 已設定 */
export async function getKvClient(): Promise<KvClient | null> {
  if (kvClient) return kvClient;
  if (kvInitAttempted) return null;
  kvInitAttempted = true;

  const kvUrl = process.env.VERCEL_KV_URL;
  const kvToken = process.env.VERCEL_KV_TOKEN;

  if (kvUrl && kvToken) {
    try {
      // Dynamic import — @vercel/kv is an optional dependency
      // @ts-expect-error — @vercel/kv may not be installed
      const mod = await import('@vercel/kv');
      if (mod?.kv) {
        kvClient = mod.kv;
        activeBackend = 'kv';
        logger.info({ module: 'vercel-kv', backend: 'Vercel KV' }, 'KV client initialized');
        return kvClient;
      }
    } catch {
      logger.warn({ module: 'vercel-kv' }, '@vercel/kv not installed — falling back to in-memory store');
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      logger.warn({ module: 'vercel-kv' }, 'VERCEL_KV_URL/VERCEL_KV_TOKEN not set — using in-memory fallback (per-instance, not global)');
    }
  }
  return null;
}

/** 取得當前使用的 backend（用於 monitoring） */
export function getKvBackend(): 'kv' | 'memory' {
  return activeBackend;
}
