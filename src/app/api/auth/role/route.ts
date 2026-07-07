// ============================================
// API: PATCH /api/auth/role — 更新用戶角色（Google OAuth 後使用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

async function updateUserRole(userId: string, role: string) {
  await db.user.update({
    where: { id: userId },
    data: { role },
  });
}

function createRoleResponse(request: NextRequest, role: string, body?: Record<string, unknown>) {
  const target = role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { role } = await request.json();
    if (!role || !['student', 'teacher', 'admin'].includes(role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 });
    }

    await updateUserRole(session.user.id, role);

    return createRoleResponse(request, role, { success: true, role });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url), 303);
  }

  const formData = await request.formData();
  const role = formData.get('role');
  if (role !== 'student' && role !== 'teacher' && role !== 'admin') {
    return NextResponse.redirect(new URL('/role-select?error=invalid-role', request.url), 303);
  }

  await updateUserRole(session.user.id, role);

  return createRoleResponse(request, role);
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
