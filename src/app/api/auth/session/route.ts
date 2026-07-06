// ============================================
// API Route: GET /api/auth/session
// 檢查當前登入狀態，返回用戶資訊
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, type SessionPayload } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  if (!token) {
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  const session = await verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  return NextResponse.json({
    loggedIn: true,
    user: session,
  });
}
