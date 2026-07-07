// ============================================
// Next.js Middleware — 路由保護（NextAuth + JWT 雙支援）
// ============================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-next';

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

  // NextAuth session check
  const session = await auth();
  if (session?.user) {
    return NextResponse.next();
  }

  // Fallback: JWT cookie check
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    try {
      const { verifySessionToken } = await import('@/lib/auth');
      const payload = await verifySessionToken(token);
      if (payload) return NextResponse.next();
    } catch { /* fall through to redirect */ }
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
