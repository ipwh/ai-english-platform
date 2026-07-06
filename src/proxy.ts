// ============================================
// Next.js Proxy — 路由保護 (Next.js 16)
// ============================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

const publicPaths = ['/login', '/role-select', '/api/', '/style-guide'];

const rolePaths: Record<string, string[]> = {
  student: ['/student'],
  teacher: ['/teacher'],
  admin: ['/student', '/teacher', '/style-guide'],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 允許公開路由
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 允許靜態資源
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 檢查 session token
  const token = request.cookies.get('session_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 驗證 token
  const session = await verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 檢查角色權限
  const userRole = session.role;
  const allowedPaths = rolePaths[userRole] || [];

  const hasAccess = allowedPaths.some(p => pathname.startsWith(p));
  if (!hasAccess) {
    // 重導向至該角色的預設頁面
    const defaultPath = userRole === 'student' ? '/student/dashboard' : '/teacher/dashboard';
    return NextResponse.redirect(new URL(defaultPath, request.url));
  }

  return NextResponse.next();
}
