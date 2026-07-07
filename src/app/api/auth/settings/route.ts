// ============================================
// API: /api/auth/settings — 使用者設定
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, subjects: true, level: true, streakDays: true },
  });
  return NextResponse.json({ settings: user });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.subjects !== undefined) data.subjects = body.subjects;
  if (body.level !== undefined) data.level = body.level;

  await db.user.update({ where: { id: session.user.id }, data });
  return NextResponse.json({ success: true });
}
