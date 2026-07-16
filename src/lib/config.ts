// ============================================
// 集中式環境變數管理 — AI English Platform
// 統一管理所有環境變數，避免分散在各模組中重複讀取
//
// 使用方式：
//   import { config } from '@/lib/config';
//   config.deepseek.apiKey
//   config.isProduction
// ============================================

// ============================================
// 環境偵測
// ============================================

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const isDevelopment = !isProduction;

// ============================================
// 安全性 — 強制要求生產環境設定必要變數
// ============================================

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && isProduction) {
    throw new Error(
      `[config] 生產環境必須設定 ${key} 環境變數。\n` +
      '請在 Vercel Dashboard → Settings → Environment Variables 中設定。'
    );
  }
  return value || '';
}

function requireEnvNonEmpty(key: string, fallback?: string): string {
  const value = process.env[key];
  if (!value || value === 'sk-your-deepseek-api-key-here') {
    if (fallback !== undefined) return fallback;
    if (isProduction) {
      throw new Error(
        `[config] 生產環境必須設定 ${key} 環境變數（不可為預設值）。\n` +
        '請在 Vercel Dashboard → Settings → Environment Variables 中設定。'
      );
    }
  }
  return value || '';
}

// ============================================
// DeepSeek AI 設定
// ============================================

const deepseek = {
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  /** 是否已正確設定 */
  get isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== 'sk-your-deepseek-api-key-here';
  },
};

// ============================================
// Gemini API 設定
// ============================================

const gemini = {
  apiKey: process.env.GEMINI_API_KEY || '',
  baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  get isConfigured(): boolean {
    return !!this.apiKey;
  },
};

// ============================================
// Vertex AI (GCP) 設定
// ============================================

import fs from 'node:fs';
import path from 'node:path';

const vertex = {
  projectId: process.env.GCP_PROJECT_ID || '',
  location: process.env.VERTEX_AI_LOCATION || 'global',
  embeddingsLocation: process.env.VERTEX_AI_EMBEDDINGS_LOCATION || 'us-central1',
  model: process.env.VERTEX_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  embeddingsModel: 'text-embedding-004',
  get isConfigured(): boolean {
    return !!this.projectId && hasServiceAccountSource();
  },
};

function hasServiceAccountSource(): boolean {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  const localCredPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
  return fs.existsSync(localCredPath);
}

// ============================================
// JWT / Auth 設定
// ============================================

const jwt = {
  get secret(): string {
    return requireEnv('JWT_SECRET');
  },
  expiry: '7d',
};

const auth = {
  /** AUTH_SECRET 用於 NextAuth 及 middleware JWT 驗證 */
  get secret(): string {
    return requireEnv('AUTH_SECRET');
  },
  /** 開發環境預設 secrets（⚠️ 嚴禁在生產環境使用） */
  get devFallbackSecret(): string {
    if (isProduction) {
      throw new Error(
        '[config] AUTH_SECRET 未設定！生產環境必須設定此環境變數，不可使用預設值。'
      );
    }
    return 'dev-secret-change-me-in-production';
  },
};

// ============================================
// Rate Limiting 設定
// ============================================

const rateLimit = {
  /** AI API：每個 IP 每 60 秒最多 30 次請求 */
  ai: { maxRequests: 30, windowMs: 60_000 },
  /** 一般 API：每個 IP 每 60 秒最多 60 次請求 */
  api: { maxRequests: 60, windowMs: 60_000 },
  /** 上傳：每個 IP 每 60 秒最多 10 次請求 */
  upload: { maxRequests: 10, windowMs: 60_000 },
  /** 登入：每個 IP 每 60 秒最多 5 次請求 */
  login: { maxRequests: 5, windowMs: 60_000 },
};

// ============================================
// 上傳限制
// ============================================

const upload = {
  /** 最大檔案大小 (10MB) */
  maxFileSize: 10 * 1024 * 1024,
  /** 教材內容最大字元數 */
  maxContentLength: 100_000,
};

// ============================================
// 資料庫設定
// ============================================

const db = {
  /** PostgreSQL 連線池設定 */
  pool: {
    max: 5,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 60_000,
  },
};

// ============================================
// AI 設定（Timeout、快取）
// ============================================

const ai = {
  /** AI API timeout in ms。Vercel Hobby 建議 ≤8000，本地/Pro 可用 30000+ */
  timeoutMs: process.env.AI_TIMEOUT_MS ? Number(process.env.AI_TIMEOUT_MS) : (isProduction ? 8000 : 30000),
  /** 是否啟用 AI 回應快取（相同 prompt 不重複調用） */
  cacheEnabled: process.env.AI_CACHE_ENABLED ? process.env.AI_CACHE_ENABLED === 'true' : true,
  /** AI 回應快取 TTL（秒） */
  cacheTTL: 300,
};

// ============================================a
// Cron / Admin 設定
// ============================================

const cron = {
  get secret(): string {
    const s = process.env.CRON_SECRET;
    if (!s && isProduction) {
      throw new Error('[config] CRON_SECRET 未設定！生產環境必須設定。');
    }
    return s || 'dev-cron-secret-change-me';
  },
};

// ============================================
// Google Services 設定
// ============================================

const google = {
  /** Google Sheets 班級名單 ID（admin sync-sheets/export-sheets 用） */
  sheetsClassRosterId: process.env.GOOGLE_SHEETS_CLASS_ROSTER_ID || '',
  /** Drive 教材匯入 — 用 GCP Service Account 按連結下載，無需 folder ID */
  get sheetsConfigured(): boolean { return !!this.sheetsClassRosterId; },
};

// ============================================
// 整合匯出
// ============================================

export const config = {
  isProduction,
  isDevelopment,
  deepseek,
  gemini,
  vertex,
  jwt,
  auth,
  ai,
  rateLimit,
  upload,
  db,
  cron,
  google,
} as const;

export default config;
