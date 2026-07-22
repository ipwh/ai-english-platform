// ============================================
// API: PATCH /api/auth/role — 更新用戶角色（Google OAuth 後使用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/auth-next';
import { verifySessionToken } from '@/shared/auth/jwt';
import { db } from '@/shared/db/db';
import { logger } from '@/shared/logger/logger';

async function updateUserRole(userId: string, role: string) {
  await db.user.update({
    where: { id: userId },
    data: { role },
  });
}

function createRoleResponse(request: NextRequest, role: string, body?: Record<string, unknown>) {
  const target = role === 'admin' ? '/admin' : role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
  const response = body
    ? NextResponse.json(body)
    : NextResponse.redirect(new URL(target, request.url), 303);

  response.cookies.set('selected_role', role, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  return response;
}

export async function PATCH(request: NextRequest) {
  try {
    // === 優先檢查 JWT session（密碼登入） ===
    const jwtToken = request.cookies.get('session_token')?.value;
    let userId: string | null = null;

    if (jwtToken) {
      const jwtPayload = await verifySessionToken(jwtToken);
      if (jwtPayload) {
        userId = jwtPayload.userId;
      }
    }

    // === Fallback: NextAuth session（Google OAuth 登入） ===
    if (!userId) {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: '未登入' }, { status: 401 });
      }
      userId = session.user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { role } = await request.json();
    if (!role || !['student', 'teacher', 'admin'].includes(role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 });
    }

    await updateUserRole(userId, role);

    return createRoleResponse(request, role, { success: true, role });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // === 優先檢查 JWT session（密碼登入） ===
  const jwtToken = request.cookies.get('session_token')?.value;
  let userId: string | null = null;

  if (jwtToken) {
    const jwtPayload = await verifySessionToken(jwtToken);
    if (jwtPayload) {
      userId = jwtPayload.userId;
    }
  }

  // === Fallback: NextAuth session（Google OAuth 登入） ===
  if (!userId) {
    const session = await auth();
    logger.info({ module: 'role-select' }, 'POST role-select session check');

    if (!session?.user?.id) {
      logger.warn({ module: 'role-select' }, 'No session, redirecting to login');
      return NextResponse.redirect(new URL('/login', request.url), 303);
    }
    userId = session.user.id;
  }

  if (!userId) {
    logger.warn({ module: 'role-select' }, 'No userId, redirecting to login');
    return NextResponse.redirect(new URL('/login', request.url), 303);
  }

  const formData = await request.formData();
  const role = formData.get('role');

  logger.info({ module: 'role-select', role, userId }, 'Role selected');

  if (role !== 'student' && role !== 'teacher' && role !== 'admin') {
    logger.warn({ module: 'role-select', role }, 'Invalid role, redirecting');
    return NextResponse.redirect(new URL('/role-select?error=invalid-role', request.url), 303);
  }

  // ⚠️ 不再更新 DB role — 角色切換僅設定 selected_role cookie
  // DB role 保持為用戶的「真實最高角色」（admin/teacher/student）
  // 這樣用戶在學生/教師/管理員視圖之間切換時，平台仍能識別其真實身份

  const response = createRoleResponse(request, role);

  logger.info({ module: 'role-select', redirectTo: response.headers.get('location') }, 'Role redirect');

  return response;
}

// GET /api/auth/role — 獲取當前用戶資訊（支援 JWT + NextAuth 雙驗證）
export async function GET(request: NextRequest) {
  let userId: string | null = null;

  // 優先檢查 JWT session token（密碼登入）
  const jwtToken = request.cookies.get('session_token')?.value;
  if (jwtToken) {
    const jwtPayload = await verifySessionToken(jwtToken);
    if (jwtPayload) {
      userId = jwtPayload.userId;
    }
  }

  // Fallback: NextAuth session（Google OAuth 登入）
  if (!userId) {
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    }
  }

  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, nameZh: true, role: true, image: true },
  });

  return NextResponse.json({ user });
}
