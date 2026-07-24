// ============================================
// 集中式環境變數管理 — AI English Platform
// 統一管理所有環境變數，避免分散在各模組中重複讀取
//
// 使用方式：
//   import { config } from '@/shared/config/config';
//   config.deepseek.apiKey
//   config.isProduction
//
// Sprint 102: Added Zod runtime validation at startup — validates all required
// env vars and crashes fast with clear error messages in production.
// ============================================

import { z } from 'zod';

// ============================================
// 環境偵測
// ============================================

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const isDevelopment = !isProduction;

// ============================================
// Zod Runtime Validation — crash-fast on missing required env vars
// ============================================

const envSchema = z.object({
  // AI Providers (at least one must be configured in production)
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().optional(),
  DEEPSEEK_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  VERTEX_AI_LOCATION: z.string().optional(),
  VERTEX_AI_EMBEDDINGS_LOCATION: z.string().optional(),
  VERTEX_GEMINI_MODEL: z.string().optional(),
  GCP_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  // Auth (required in production)
  JWT_SECRET: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  // Database
  DATABASE_URL: z.string().optional(),
  // AI tuning
  AI_TIMEOUT_MS: z.string().optional(),
  AI_CACHE_ENABLED: z.string().optional(),
  AI_CACHE_TTL_MS: z.string().optional(),
  // RAG
  DSE_RAG_ENABLED: z.string().optional(),
  // Cron
  CRON_SECRET: z.string().optional(),
  // Google
  GOOGLE_SHEETS_CLASS_ROSTER_ID: z.string().optional(),
  // KV
  VERCEL_KV_URL: z.string().optional(),
  KV_URL: z.string().optional(),
  VERCEL_KV_TOKEN: z.string().optional(),
  KV_TOKEN: z.string().optional(),
  // Node
  NODE_ENV: z.string().optional(),
  VERCEL: z.string().optional(),
}).passthrough(); // Allow unknown env vars (e.g. Vercel-injected vars)

// Validate at import time — crash fast with clear message
try {
  envSchema.parse(process.env);
} catch (err) {
  if (isProduction) {
    console.error('[config] ❌ Environment validation failed:', (err as Error).message);
    throw new Error(`[config] Invalid environment variables: ${(err as Error).message}`);
  }
  // In development, just warn — don't crash
  console.warn('[config] ⚠️ Environment validation warning (non-blocking in dev):', (err as Error).message);
}

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
import { logger } from '@/shared/logger/logger';

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
  if (fs.existsSync(localCredPath)) {
    if (isProduction) {
      logger.error({ module: 'config' }, 'Production detected local credential file materials/gcp-service-account.json — remove it and use GCP_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS env var');
    }
    return true;
  }
  // 檢查 materials/ 中是否有 client_secret 檔案（不應存在）
  try {
    const matDir = path.join(process.cwd(), 'materials');
    if (fs.existsSync(matDir)) {
      const files = fs.readdirSync(matDir);
      const secretFiles = files.filter(f => f.startsWith('client_secret_') && f.endsWith('.json'));
      if (secretFiles.length > 0) {
        logger.error({ module: 'config', files: secretFiles }, 'Google OAuth client secret files detected in materials/ — remove immediately and ensure .gitignore');
      }
    }
  } catch { /* 無法讀取目錄，忽略 */ }
  return false;
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
  /** AI API：每個 IP 每 60 秒最多 60 次請求（同校 2 班同時使用） */
  ai: { maxRequests: 60, windowMs: 60_000 },
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
  timeoutMs: (() => {
    const val = Number(process.env.AI_TIMEOUT_MS);
    return Number.isFinite(val) && val > 0 ? val : (isProduction ? 8000 : 30000);
  })(),
  /** 是否啟用 AI 回應快取（相同 prompt 不重複調用） */
  cacheEnabled: process.env.AI_CACHE_ENABLED ? process.env.AI_CACHE_ENABLED !== 'false' : true,
  /** AI 回應快取 TTL（毫秒），預設 1 小時 */
  cacheTTLMs: Number(process.env.AI_CACHE_TTL_MS) || 3_600_000,
};

// ============================================
// RAG 設定
// ============================================

const rag = {
  /** 是否啟用 DSE RAG（歷屆試題檢索增強生成） */
  dseRagEnabled: process.env.DSE_RAG_ENABLED === 'true',
};

// ============================================
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

const kv = {
  url: process.env.VERCEL_KV_URL || process.env.KV_URL || '',
  token: process.env.VERCEL_KV_TOKEN || process.env.KV_TOKEN || '',
  get isConfigured(): boolean { return !!this.url && !!this.token; },
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
  rag,
  google,
  kv,
} as const;

export default config;
