// ============================================
// Edge Runtime 安全設定檔 — 零 Node.js 依賴
// 僅使用 process.env，不引入 fs/path 等 Node 模組
// 供 middleware.ts 等 Edge Runtime 環境使用
// ============================================

// ============================================
// 環境偵測
//
// 部署目標：Google Cloud Run（Vercel 已不再使用，2026-09-15），
// 由 Dockerfile / cloud-run.yaml 注入 NODE_ENV=production。
// ============================================
export const edgeIsProduction = process.env.NODE_ENV === 'production';

// ============================================
// Auth 設定
// ============================================
export function getEdgeAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      '[edge-config] AUTH_SECRET 環境變數未設定。\n' +
      '請在 .env.local 設定至少 32 字元的隨機字串。' +
      (edgeIsProduction ? '\n生產環境嚴禁使用預設值。' : '')
    );
  }
  return secret;
}

export function getEdgeJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[edge-config] JWT_SECRET 環境變數未設定。\n' +
      '生產環境必須使用至少 32 字元的隨機字串。'
    );
  }
  return new TextEncoder().encode(secret);
}

// ============================================
// Cookie 名稱
// ============================================
export const EDGE_SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

// ============================================
// 公開路徑（無需認證）
// ============================================
export const EDGE_PUBLIC_PATHS = ['/login', '/role-select', '/api/auth', '/style-guide'];

// ============================================
// Rate Limiting（Edge 支援）
// ============================================
export const EDGE_RATE_LIMITS = {
  practice: { maxRequests: 30, windowMs: 60_000 },
  ai: { maxRequests: 20, windowMs: 60_000 },
  auth: { maxRequests: 10, windowMs: 60_000 },
} as const;
