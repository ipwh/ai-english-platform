// ============================================
// API: /api/auth/profile — 個人資料讀取與更新
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/auth-next';
import { verifySessionToken } from '@/shared/auth/jwt';
import { db } from '@/shared/db/db';
import { validateRequest, studentLevel } from '@/shared/validation/schemas';
import { z } from 'zod';

const profileUpdateSchema = z.object({
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  level: studentLevel,
  classNumber: z.string().optional(),
});

async function resolveCurrentUser(request?: NextRequest) {
  const jwtToken = request?.cookies.get('session_token')?.value;
  if (jwtToken) {
    const payload = await verifySessionToken(jwtToken);
    if (payload?.userId) {
      return db.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true, email: true, name: true, nameZh: true, nameEn: true,
          role: true, image: true, level: true, classNumber: true,
          streakDays: true, joinedAt: true, createdAt: true,
          class: { select: { name: true, gradeLevel: true } },
        },
      });
    }
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  return db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, email: true, name: true, nameZh: true, nameEn: true,
      role: true, image: true, level: true, classNumber: true,
      streakDays: true, joinedAt: true, createdAt: true,
      class: { select: { name: true, gradeLevel: true } },
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await resolveCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ user });
  } catch (err: unknown) {
    console.error('[Auth Profile GET]', err);
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
    const parsed = validateRequest(profileUpdateSchema, body);
    const { nameZh, nameEn, level, classNumber } = parsed;

    const data: Record<string, string> = {};
    if (nameZh !== undefined) data.nameZh = nameZh;
    if (nameEn !== undefined) data.nameEn = nameEn;
    if (level !== undefined) data.level = level;
    if (classNumber !== undefined) data.classNumber = classNumber;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id: currentUser.id },
      data,
      select: { id: true, nameZh: true, nameEn: true, level: true, classNumber: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '更新失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
