// ============================================
// Rate Limiter — 滑動窗口限流
// 保護 AI API 端點免受濫用
//
// ⚠️ Vercel 注意：此實作使用 in-memory Map，在 serverless 多實例
//    環境下各 instance 獨立計數，無法做到全局精確限流。
//    對生產環境嚴格限流需求，建議升級為：
//    - Vercel KV (@vercel/kv): 適合 Hobby/Pro plan
//    - Upstash Redis: 適合大規模部署
//    目前 in-memory 版本仍可防止單一 instance 的瞬時濫用。
// ============================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/** 定期清理過期條目（每 60 秒） */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
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
 * 檢查請求是否超過速率限制
 *
 * @example
 * const result = checkRateLimit({ maxRequests: 30, windowMs: 60_000, identifier: ip });
 * if (!result.allowed) {
 *   return NextResponse.json({ error: result.message }, { status: 429,
 *     headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)) }
 *   });
 * }
 */
export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const key = config.identifier || 'global';
  const now = Date.now();
  const entry = store.get(key);

  // 新窗口或已過期
  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }

  // 增加計數
  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfterMs = entry.resetAt - now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      message: `請求過於頻繁。請 ${Math.ceil(retryAfterMs / 1000)} 秒後重試。（上限：${config.maxRequests} 次/${config.windowMs / 1000}秒）`,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
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
