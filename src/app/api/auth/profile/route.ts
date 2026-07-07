// ============================================
// API: /api/auth/profile — 個人資料讀取與更新
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, email: true, name: true, nameZh: true, nameEn: true,
      role: true, image: true, level: true, classNumber: true,
      streakDays: true, joinedAt: true, createdAt: true,
      class: { select: { name: true, gradeLevel: true } },
    },
  });

  if (!user) return NextResponse.json({ error: '用戶不存在' }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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

    const user = await db.user.update({
      where: { id: session.user.id },
      data,
      select: { id: true, nameZh: true, nameEn: true, level: true, classNumber: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '更新失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
