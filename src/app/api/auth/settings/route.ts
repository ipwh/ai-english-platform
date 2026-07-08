// ============================================
// API: /api/auth/settings — 使用者設定（含任教班級）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import { verifySessionToken } from '@/lib/jwt';
import db from '@/lib/db';

async function getUserId(request: NextRequest): Promise<string | null> {
  // NextAuth session
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  // JWT session
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) return payload.userId;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, subjects: true, level: true,
      taughtClasses: { include: { class: { select: { id: true, name: true, gradeLevel: true } } } },
    },
  });

  return NextResponse.json({
    settings: {
      ...user,
      classIds: user?.taughtClasses?.map(tc => tc.class.id) || [],
      classNames: user?.taughtClasses?.map(tc => tc.class.name) || [],
    },
  });
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Update user fields
  const userData: Record<string, unknown> = {};
  if (body.subjects !== undefined) userData.subjects = typeof body.subjects === 'string' ? body.subjects : JSON.stringify(body.subjects);
  if (body.level !== undefined) userData.level = body.level;

  if (Object.keys(userData).length > 0) {
    await db.user.update({ where: { id: userId }, data: userData });
  }

  // Update teacher-class associations
  if (body.classIds !== undefined && Array.isArray(body.classIds)) {
    // Remove all existing associations
    await db.teacherClass.deleteMany({ where: { teacherId: userId } });
    // Create new associations
    for (const classId of body.classIds) {
      await db.teacherClass.create({
        data: { teacherId: userId, classId, isFormTeacher: false },
      }).catch(() => {}); // Ignore duplicates
    }
  }

  return NextResponse.json({ success: true });
}
