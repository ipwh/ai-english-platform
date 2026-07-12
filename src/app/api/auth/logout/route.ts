// ============================================
// API Route: POST/GET /api/auth/logout
// 登出，清除所有 session cookie
// ============================================

import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}

export async function GET() {
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}

function clearAuthCookies(response: NextResponse) {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
  response.cookies.set('session_token', '', cookieOpts);
  response.cookies.set('authjs.session-token', '', cookieOpts);
  response.cookies.set('__Secure-authjs.session-token', '', { ...cookieOpts, secure: true });
  response.cookies.set('next-auth.session-token', '', cookieOpts);
  response.cookies.set('__Secure-next-auth.session-token', '', { ...cookieOpts, secure: true });
  response.cookies.set('selected_role', '', cookieOpts);
}
