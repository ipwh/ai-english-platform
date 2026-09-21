// ============================================
// API Route: POST /api/auth/login
// 登入驗證，返回 JWT token
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, recordLoginActivity } from '@/shared/auth/auth';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { ALL_CLEARABLE_COOKIE_NAMES } from '@/shared/auth/auth-cookies';

export async function POST(request: NextRequest) {
  try {
    // 🔒 Rate limiting — prevent brute force (5 attempts per minute per IP)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({
      maxRequests: 5,
      windowMs: 60_000,
      identifier: `login:${ip}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.message || '請求過於頻繁，請稍後重試。 / Too many requests, please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: '請提供電郵地址和密碼。 / Please provide email and password' },
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

    // Activity monitoring must reflect successful password logins as well as
    // practice attempts; a failure to write telemetry must not block login.
    await recordLoginActivity(result.user!.userId).catch((error: unknown) => {
      logger.warn({ module: 'auth-login', error: error instanceof Error ? error.message : String(error) }, 'Failed to record login activity');
    });

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

    // 清除所有 NextAuth session cookie，避免舊 Google OAuth session 覆蓋 JWT 登入
    for (const name of ALL_CLEARABLE_COOKIE_NAMES) {
      response.cookies.set(name, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'auth-login', error: message }, 'Login failed');
    // 開發/測試階段顯示詳細錯誤以方便除錯
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      { error: isDev ? `伺服器錯誤：${message}` : '伺服器錯誤，請稍後再試。 / Server error, please try again later.' },
      { status: 500 }
    );
  }
}
