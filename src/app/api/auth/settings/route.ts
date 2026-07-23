import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: /api/auth/settings — 使用者設定（含任教班級）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/auth-next';
import { verifySessionToken } from '@/shared/auth/jwt';
import { logger } from '@/shared/logger/logger';
import { findUserByIdSelect, updateUser, deleteTeacherClasses, createTeacherClass } from '@/modules/student';

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

    const user = await adminDbQuery('user', 'findUnique', {
    where: { id: userId },
    select: {
      id: true, subjects: true, department: true, level: true,
      taughtClasses: { include: { class: { select: { id: true, name: true, gradeLevel: true } } } },
    },
  }) as {id: string; subjects: string | null; department: string | null; level: string | null; taughtClasses: Array<{isFormTeacher: boolean; class: {id: string; name: string; gradeLevel: string}}>} | null;

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
    logger.error({ module: 'auth-settings', error: err instanceof Error ? err.message : String(err) }, 'Auth Settings GET failed');
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Update user fields
  const userData: Record<string, unknown> = {};
  if (body.subjects !== undefined) userData.subjects = typeof body.subjects === 'string' ? body.subjects : JSON.stringify(body.subjects);
  if (body.level !== undefined) userData.level = body.level;

  if (Object.keys(userData).length > 0) {
    await adminDbQuery('user', 'update', { where: { id: userId }, data: userData });
  }

  // Update teacher-class associations
  if (body.classIds !== undefined && Array.isArray(body.classIds)) {
    // Remove all existing associations
    await adminDbQuery('teacherClass', 'deleteMany', { where: { teacherId: userId } });
    // Create new associations
    for (const classId of body.classIds) {
      await adminDbQuery('teacherClass', 'create', {
        data: { teacherId: userId, classId, isFormTeacher: false },
      }).catch(() => {}); // Ignore duplicates
    }
  }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logger.error({ module: 'auth-settings', error: err instanceof Error ? err.message : String(err) }, 'Auth Settings PATCH failed');
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

