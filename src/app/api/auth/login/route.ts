// ============================================
// API Route: POST /api/auth/login
// 登入驗證，返回 JWT token
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: '請提供電郵地址和密碼。' },
        { status: 400 }
      );
    }

    const result = await authenticateUser(email, password);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      );
    }

    // 建立 response 並設定 httpOnly cookie
    const response = NextResponse.json({
      success: true,
      user: result.user,
    });

    response.cookies.set('session_token', result.token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: '/',
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[auth/login] Error:', message);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
