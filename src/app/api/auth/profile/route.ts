// ============================================
// API: /api/auth/profile — 個人資料讀取與更新
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/auth-next';
import { verifySessionToken } from '@/shared/auth/jwt';
import { logger } from '@/shared/logger/logger';
import { findUserByIdSelect, updateUser } from '@/modules/student';

async function resolveCurrentUser(request?: NextRequest) {
  const jwtToken = request?.cookies.get('session_token')?.value;
  if (jwtToken) {
    const payload = await verifySessionToken(jwtToken);
    if (payload?.userId) {
      return findUserByIdSelect(payload.userId, {
        id: true, email: true, name: true, nameZh: true, nameEn: true,
        role: true, image: true, level: true, classNumber: true,
        streakDays: true, joinedAt: true, createdAt: true,
      });
    }
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  return findUserByIdSelect(session.user.id, {
    id: true, email: true, name: true, nameZh: true, nameEn: true,
    role: true, image: true, level: true, classNumber: true,
    streakDays: true, joinedAt: true, createdAt: true,
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ user });
  } catch (err: unknown) {
    logger.error({ module: 'auth-profile', error: err instanceof Error ? err.message : String(err) }, 'Auth Profile GET failed');
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await resolveCurrentUser(request);
    if (!currentUser?.id) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const body = await request.json();
    const { nameZh, nameEn, level, classNumber } = body;

    const data: Record<string, string> = {};
    if (nameZh !== undefined) data.nameZh = nameZh;
    if (nameEn !== undefined) data.nameEn = nameEn;
    if (level !== undefined) data.level = level;
    if (classNumber !== undefined) data.classNumber = classNumber;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
    }

    const user = await updateUser(currentUser.id, { name: body.name, nameZh: body.nameZh, nameEn: body.nameEn });

    return NextResponse.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '更新失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

