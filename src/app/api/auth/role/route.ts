// ============================================
// API: PATCH /api/auth/role — 更新用戶角色（Google OAuth 後使用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { role } = await request.json();
    if (!role || !['student', 'teacher', 'admin'].includes(role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 });
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { role },
    });

    const response = NextResponse.json({ success: true, role });
    response.cookies.set('selected_role', role, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/auth/role — 獲取當前用戶資訊
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, nameZh: true, role: true, image: true },
  });

  return NextResponse.json({ user });
}
