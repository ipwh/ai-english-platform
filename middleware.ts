// ============================================
// Next.js Middleware — 路由保護（Edge Runtime 安全）
// 不引入 Prisma/NextAuth，僅使用 jose 驗證 JWT
// ============================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';

const publicPaths = ['/login', '/role-select', '/api/auth', '/style-guide'];

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

  // 允許 API 路由（由各 route handler 自行驗證）
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // === Vercel Deployment Protection 處理 ===
  // 若開啟了 Vercel Deployment Protection，_vercel_jwt cookie 會在所有請求中出現
  // 這不應該阻擋正常的 auth flow；只在同時缺少所有 auth cookie 時記錄警告
  const isVercelProtected = request.cookies.has('_vercel_jwt');

  // NextAuth v5 session cookie check（Google OAuth 登入）
  const hasNextAuthCookie =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token') ||
    request.cookies.has('next-auth.session-token') ||
    request.cookies.has('__Secure-next-auth.session-token');

  // 若只有 Vercel protection cookie 而沒有任何 auth cookie，
  // 且當前不是 auth 相關路徑 → 可能是 Vercel 驗證阻擋了正常登入流程
  if (isVercelProtected && !hasNextAuthCookie) {
    console.warn(
      '[middleware] ⚠️ Vercel Deployment Protection detected without auth cookies. ' +
      'If users report login issues, consider disabling Deployment Protection in Vercel Dashboard → Settings → Deployment Protection.'
    );
  }

  if (hasNextAuthCookie) {
    return NextResponse.next();
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
      return NextResponse.next();
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
