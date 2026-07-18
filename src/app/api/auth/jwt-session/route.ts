// ============================================
// API Route: GET /api/auth/jwt-session
// 檢查 JWT session_token cookie（密碼登入用）
// 注意：NextAuth session 由 /api/auth/session（[...nextauth]）處理
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/shared/auth/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  if (!token) {
    return NextResponse.json({ loggedIn: false });
  }

  const jwtSession = await verifySessionToken(token);

  if (!jwtSession) {
    return NextResponse.json({ loggedIn: false });
  }

  return NextResponse.json({
    loggedIn: true,
    user: jwtSession,
  });
}
