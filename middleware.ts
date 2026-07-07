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

  // NextAuth v5 session cookie check（Google OAuth 登入）
  // 僅檢查 cookie 存在性，實際 session 驗證由頁面/API 的 auth() 處理
  const hasNextAuthCookie =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('next-auth.session-token') ||
    request.cookies.has('__Secure-next-auth.session-token');
  if (hasNextAuthCookie) {
    return NextResponse.next();
  }

  // JWT session token check（密碼登入）
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) return NextResponse.next();
  }

  // 未認證 → 導向登入頁
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
