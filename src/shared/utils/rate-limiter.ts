// ============================================
// Rate Limiter — 滑動窗口限流
// 保護 AI API 端點免受濫用
//
// 部署目標：Google Cloud Run（Vercel 已不再使用，2026-09-15）
//    - 目前為 in-memory Map：每 instance 獨立計數，非全域精確
//    - Cloud Run 最多 20 instances（cloud-run.yaml）
//      → 實際全域上限約為 maxRequests × 運行中 instance 數
//
// ⚠️ 全局限流尚未實作：原 Vercel KV 路徑已移除（`@vercel/kv` 已廢棄，
//    且 VERCEL_KV_URL 從未在 Cloud Run 設定）。如需全域精確限流，
//    請接入 Redis / Memorystore 並在此處加入 adapter。
// ============================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/** 取得當前使用的 backend（用於 monitoring） */
export function getRateLimitBackend(): 'memory' {
  return 'memory';
}

/** 定期清理過期條目（in-memory mode only，每 60 秒） */
// Module-level rate limit reset — persists for application lifetime, no cleanup needed
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
 * 注意：in-memory 計數為 per-instance，多 instance 時非全域精確。
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const key = config.identifier || 'global';
  const now = Date.now();

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + config.windowMs };
    store.set(key, newEntry);
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: newEntry.resetAt };
  }
  entry.count++;
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt,
      message: `請求過於頻繁。請 ${Math.ceil((entry.resetAt - now) / 1000)} 秒後重試。（上限：${config.maxRequests} 次/${config.windowMs / 1000}秒） / Too many requests. Please retry in ${Math.ceil((entry.resetAt - now) / 1000)}s (limit: ${config.maxRequests} per ${config.windowMs / 1000}s)` };
  }
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

// ============================================
// 預設限流設定（統一從 config.ts 讀取）
// ============================================

import { config } from '@/shared/config/config';

/** AI API 端點限流：每 IP 每 60 秒（上限由 config.rateLimit.ai 決定，預設 60 次） */
export const AI_RATE_LIMIT: RateLimitConfig = {
  maxRequests: config.rateLimit.ai.maxRequests,
  windowMs: config.rateLimit.ai.windowMs,
};

/** 登入端點限流：每 IP 每 60 秒最多 5 次請求（防止暴力破解） */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxRequests: config.rateLimit.login.maxRequests,
  windowMs: config.rateLimit.login.windowMs,
};

/** 一般 CRUD 端點限流：每 IP 每 60 秒 30 次 */
export const GENERAL_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};
