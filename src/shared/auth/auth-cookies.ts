// ============================================
// NextAuth / Auth.js Cookie 名稱 — 集中管理
// 供 middleware.ts 與 login/route.ts 共用，
// 確保 cookie 名稱一致，避免 NextAuth 版本升級時漏改
// ============================================

/** NextAuth v5 session token cookies（按優先級排序） */
export const AUTHJS_SESSION_COOKIES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
] as const;

/** Legacy NextAuth v4 session token cookies */
export const LEGACY_NEXTAUTH_SESSION_COOKIES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
] as const;

/** 所有 session cookie 名稱（用於登出時清除） */
export const ALL_SESSION_COOKIE_NAMES = [
  ...AUTHJS_SESSION_COOKIES,
  ...LEGACY_NEXTAUTH_SESSION_COOKIES,
] as const;

/** Callback URL cookies（登出時需清除） */
export const CALLBACK_COOKIE_NAMES = [
  'authjs.callback-url',
  'next-auth.callback-url',
] as const;

/** CSRF token cookies（登出時需清除） */
export const CSRF_COOKIE_NAMES = [
  'authjs.csrf-token',
  'next-auth.csrf-token',
] as const;

/** 登入時需清除的所有 NextAuth cookies */
export const ALL_CLEARABLE_COOKIE_NAMES = [
  ...ALL_SESSION_COOKIE_NAMES,
  ...CALLBACK_COOKIE_NAMES,
  ...CSRF_COOKIE_NAMES,
] as const;
