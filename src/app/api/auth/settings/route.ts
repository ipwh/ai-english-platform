// ============================================
// API: /api/auth/settings — 使用者設定（含任教班級）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/auth-next';
import { verifySessionToken } from '@/shared/auth/jwt';
import { db } from '@/shared/db/db';
import { validateRequest, studentLevel } from '@/shared/validation/schemas';
import { z } from 'zod';

const settingsUpdateSchema = z.object({
  subjects: z.union([z.string(), z.array(z.string())]).optional(),
  level: studentLevel,
});

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
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, subjects: true, department: true, level: true,
      taughtClasses: { include: { class: { select: { id: true, name: true, gradeLevel: true } } } },
    },
  });

  const taughtClasses = user?.taughtClasses?.map(tc => ({
    name: tc.class.name,
    isFormTeacher: tc.isFormTeacher,
  })) || [];
  const formTeacherOf = user?.taughtClasses?.find(tc => tc.isFormTeacher)?.class.name || undefined;

    return NextResponse.json({
      settings: {
        ...user,
        classIds: user?.taughtClasses?.map(tc => tc.class.id) || [],
        classNames: user?.taughtClasses?.map(tc => tc.class.name) || [],
      },
      profile: {
        subjects: user?.subjects || undefined,
        department: user?.department || undefined,
        formTeacherOf,
        taughtClasses,
      },
    });
  } catch (err: unknown) {
    console.error('[Auth Settings GET]', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = validateRequest(settingsUpdateSchema, body);

  // Update user fields
  const userData: Record<string, unknown> = {};
  if (parsed.subjects !== undefined) userData.subjects = typeof parsed.subjects === 'string' ? parsed.subjects : JSON.stringify(parsed.subjects);
  if (parsed.level !== undefined) userData.level = parsed.level;

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
  } catch (err: unknown) {
    console.error('[Auth Settings PATCH]', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
