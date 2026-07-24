// ============================================
// Next.js Middleware — 路由保護（Edge Runtime 安全）
// 不引入 Prisma/NextAuth，僅使用 jose 驗證 JWT
// Sprint 104: Added CSRF token cookie injection for mutation protection
// ============================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/shared/auth/jwt';
import { jwtVerify } from 'jose';
import { ALL_SESSION_COOKIE_NAMES } from '@/shared/auth/auth-cookies';
import { getEdgeAuthSecret, EDGE_PUBLIC_PATHS } from '@/shared/config/edge-config';

// Edge-compatible CSRF token generation (no Node.js crypto)
function generateEdgeCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const publicPaths = EDGE_PUBLIC_PATHS;

/** 安全取得 AUTH_SECRET（Edge Runtime 無法匯入 config.ts 含 fs 依賴的模組） */
function getAuthSecret(): string {
  return getEdgeAuthSecret();
}

/**
 * 從 NextAuth session cookie 中提取並驗證 JWT，取得 user role
 * NextAuth v5 的 session-token 本身就是一個 JWT
 */
async function getRoleFromNextAuthCookie(request: NextRequest): Promise<string | null> {
  // Use shared cookie name list to find the active session cookie
  for (const name of ALL_SESSION_COOKIE_NAMES) {
    const token = request.cookies.get(name)?.value;
    if (!token) continue;
    try {
      const secret = new TextEncoder().encode(getAuthSecret());
      const { payload } = await jwtVerify(token, secret);
      const role = (payload as Record<string, unknown>)?.role;
      return typeof role === 'string' ? role : null;
    } catch { /* try next cookie */ }
  }
  return null;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 允許公開路由
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 允許靜態資源
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // 允許 API 路由（由各 route handler 自行驗證，middleware 注入 CSRF cookie）
  if (pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    // Inject CSRF token cookie for API consumers (mutation endpoints validate it)
    if (!request.cookies.has('csrf-token')) {
      const csrfToken = generateEdgeCsrfToken();
      response.cookies.set('csrf-token', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      });
    }
    return response;
  }

  // === Vercel Deployment Protection 處理 ===
  // 若開啟了 Vercel Deployment Protection，_vercel_jwt cookie 會在所有請求中出現
  // 這不應該阻擋正常的 auth flow；只在同時缺少所有 auth cookie 時記錄警告
  const isVercelProtected = request.cookies.has('_vercel_jwt');

  // NextAuth v5 session cookie check（Google OAuth 登入）
  const hasNextAuthCookie = ALL_SESSION_COOKIE_NAMES.some(name => request.cookies.has(name));

  // 若只有 Vercel protection cookie 而沒有任何 auth cookie，
  // 且當前不是 auth 相關路徑 → 可能是 Vercel 驗證阻擋了正常登入流程
  if (isVercelProtected && !hasNextAuthCookie) {
    // Vercel Deployment Protection detected — non-blocking, just informational
    // In production, this is expected behavior for protected preview deployments
  }

  if (hasNextAuthCookie) {
    // 🔐 Resolve effective role: JWT role (verified) may be overridden by
    // selected_role cookie (view-switch preference), but ONLY for downgrades.
    // Hierarchy: admin > teacher > student
    const jwtRole = await getRoleFromNextAuthCookie(request);
    const selectedRole = request.cookies.get('selected_role')?.value || null;

    // Determine effective role — only allow downgrades via selected_role
    const effectiveRole = (() => {
      if (!jwtRole) return selectedRole; // fallback if JWT decode failed
      if (!selectedRole) return jwtRole;
      // Allow admin → teacher/student, teacher → student. Deny upgrades.
      if (jwtRole === 'admin') return selectedRole; // admin can switch to any view
      if (jwtRole === 'teacher' && selectedRole === 'student') return 'student';
      return jwtRole; // deny all other switches (student→teacher, teacher→admin, etc.)
    })();

    // 檢查 admin 路由權限
    if (pathname.startsWith('/admin')) {
      // Admin routes: allow admin or teacher (for student analysis sub-pages)
      if (effectiveRole !== 'admin' && effectiveRole !== 'teacher') {
        const forbiddenUrl = new URL('/login', request.url);
        forbiddenUrl.searchParams.set('error', 'admin_only');
        return NextResponse.redirect(forbiddenUrl);
      }
    }

    // 檢查 teacher 路由權限
    if (pathname.startsWith('/teacher')) {
      if (effectiveRole !== 'teacher' && effectiveRole !== 'admin') {
        const forbiddenUrl = new URL('/login', request.url);
        forbiddenUrl.searchParams.set('error', 'teacher_only');
        return NextResponse.redirect(forbiddenUrl);
      }
    }

    // Inject CSRF token for NextAuth-authenticated users
    const nextAuthResponse = NextResponse.next();
    if (!request.cookies.has('csrf-token')) {
      nextAuthResponse.cookies.set('csrf-token', generateEdgeCsrfToken(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      });
    }
    return nextAuthResponse;
  }

  // JWT session token check（密碼登入）
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      // === Admin 路由保護：僅 role === 'admin' 可存取 /admin ===
      if (pathname.startsWith('/admin') && payload.role !== 'admin') {
        const forbiddenUrl = new URL('/login', request.url);
        forbiddenUrl.searchParams.set('error', 'admin_only');
        return NextResponse.redirect(forbiddenUrl);
      }

      // === Teacher 路由保護：僅 role === 'teacher' 或 'admin' 可存取 /teacher ===
      if (pathname.startsWith('/teacher') && payload.role !== 'teacher' && payload.role !== 'admin') {
        const forbiddenUrl = new URL('/login', request.url);
        forbiddenUrl.searchParams.set('error', 'teacher_only');
        return NextResponse.redirect(forbiddenUrl);
      }

      // Inject CSRF token cookie for authenticated users
      const jwtResponse = NextResponse.next();
      if (!request.cookies.has('csrf-token')) {
        jwtResponse.cookies.set('csrf-token', generateEdgeCsrfToken(), {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24,
        });
      }
      return jwtResponse;
    }
  }

  // 未認證 → 導向登入頁
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
