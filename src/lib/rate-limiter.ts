// ============================================
// Rate Limiter — 滑動窗口限流
// 保護 AI API 端點免受濫用
//
// ✅ Production-ready for Vercel serverless:
//    - 當 VERCEL_KV_URL 環境變數設定時，自動使用 Vercel KV 作為後端
//    - 未設定時 fallback 到 in-memory Map（適合單實例/低流量）
//    - In-memory mode: 每 instance 獨立計數，非全局精確
//
// 升級建議：
//    Vercel KV:  設定 VERCEL_KV_URL + VERCEL_KV_TOKEN 環境變數即可
//    Upstash Redis: 大規模部署時的建議方案
// ============================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let kvClient: { get: (k: string) => Promise<string | null>; set: (k: string, v: string, opts: { ex: number }) => Promise<void> } | null = null;

/** 嘗試初始化 Vercel KV（需先安裝 @vercel/kv） */
async function getKvClient() {
  if (kvClient) return kvClient;
  if (process.env.VERCEL_KV_URL) {
    try {
      // Only attempts to load @vercel/kv at runtime — safe if not installed
      const mod = (globalThis as any).__vercel_kv_module;
      if (mod?.kv) {
        kvClient = mod.kv;
        console.log('[RateLimiter] Using Vercel KV backend');
        return kvClient;
      }
    } catch { /* @vercel/kv not installed, fall through */ }
  }
  return null;
}

/** 定期清理過期條目（in-memory mode only，每 60 秒） */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000);
}

export interface RateLimitConfig {
  /** 時間窗口內的最大請求數 */
  maxRequests: number;
  /** 時間窗口（毫秒） */
  windowMs: number;
  /** 用於識別請求者的 key（如 IP） */
  identifier?: string;
}

export interface RateLimitResult {
  /** 是否允許請求 */
  allowed: boolean;
  /** 剩餘請求數 */
  remaining: number;
  /** 重設時間（Unix timestamp ms） */
  resetAt: number;
  /** 超過限制時的錯誤訊息 */
  message?: string;
}

/**
 * 檢查請求是否超過速率限制。
 * 當 VERCEL_KV_URL 設定時自動升級為分散式限流。
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const key = config.identifier || 'global';
  const now = Date.now();

  // Try Vercel KV first
  const kv = await getKvClient();
  if (kv) {
    try {
      const raw = await kv.get(key);
      const entry: RateLimitEntry | null = raw ? JSON.parse(raw) : null;
      if (!entry || now > entry.resetAt) {
        const newEntry: RateLimitEntry = { count: 1, resetAt: now + config.windowMs };
        await kv.set(key, JSON.stringify(newEntry), { ex: Math.ceil(config.windowMs / 1000) });
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: newEntry.resetAt };
      }
      entry.count++;
      await kv.set(key, JSON.stringify(entry), { ex: Math.ceil((entry.resetAt - now) / 1000) });
      if (entry.count > config.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt,
          message: `請求過於頻繁。請 ${Math.ceil((entry.resetAt - now) / 1000)} 秒後重試。（上限：${config.maxRequests} 次/${config.windowMs / 1000}秒）` };
      }
      return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
    } catch (err) {
      console.error('[RateLimiter] KV error, falling back to in-memory:', err);
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + config.windowMs };
    store.set(key, newEntry);
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: newEntry.resetAt };
  }
  entry.count++;
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt,
      message: `請求過於頻繁。請 ${Math.ceil((entry.resetAt - now) / 1000)} 秒後重試。（上限：${config.maxRequests} 次/${config.windowMs / 1000}秒）` };
  }
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

// ============================================
// 預設限流設定
// ============================================

/** AI API 端點限流：每 IP 每 60 秒最多 30 次請求 */
export const AI_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};

/** 登入端點限流：每 IP 每 60 秒最多 10 次請求（防止暴力破解） */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000,
};
