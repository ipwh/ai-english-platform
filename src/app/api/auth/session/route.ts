// ============================================
// API Route: GET /api/auth/session
// 檢查當前登入狀態，返回用戶資訊
// 支援 NextAuth (Google OAuth) + JWT (密碼登入) 雙重認證
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import { verifySessionToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // 1️⃣ 優先檢查 NextAuth session（Google OAuth 登入）
  try {
    const nextAuthSession = await auth();
    if (nextAuthSession?.user?.id) {
      return NextResponse.json({
        loggedIn: true,
        user: {
          userId: nextAuthSession.user.id,
          email: nextAuthSession.user.email,
          nameZh: nextAuthSession.user.name || nextAuthSession.user.email?.split('@')[0],
          nameEn: nextAuthSession.user.name,
          role: nextAuthSession.user.role || 'student',
        },
      });
    }
  } catch {
    // NextAuth 檢查失敗 → 降級到 JWT
  }

  // 2️⃣ 降級：JWT session_token（密碼登入）
  const token = request.cookies.get('session_token')?.value;

  if (!token) {
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  const jwtSession = await verifySessionToken(token);

  if (!jwtSession) {
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  return NextResponse.json({
    loggedIn: true,
    user: jwtSession,
  });
}
