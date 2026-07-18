// ============================================
// API Route: POST/GET /api/auth/logout
// 登出，清除所有 session cookie
// ============================================

import { NextResponse } from 'next/server';
import { ALL_CLEARABLE_COOKIE_NAMES } from '@/shared/auth/auth-cookies';

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
  const isProduction = process.env.NODE_ENV === 'production';
  const baseOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };

  // Clear all NextAuth session/callback/csrf cookies
  for (const name of ALL_CLEARABLE_COOKIE_NAMES) {
    const isSecure = name.startsWith('__Secure-');
    response.cookies.set(name, '', { ...baseOpts, secure: isSecure || isProduction });
  }

  // Clear custom JWT session token
  response.cookies.set('session_token', '', baseOpts);

  // Clear role-switching cookie
  response.cookies.set('selected_role', '', baseOpts);
}
