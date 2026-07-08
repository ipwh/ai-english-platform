// ============================================
// GET /api/teacher/students — 教師查看任教班級學生
// 支援 JWT + NextAuth 雙重認證
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

async function getTeacherId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload && (payload.role === 'teacher' || payload.role === 'admin')) return payload.userId;
  }
  const session = await auth();
  if (session?.user?.id) {
    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (user && (user.role === 'teacher' || user.role === 'admin')) return session.user.id;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const teacherId = await getTeacherId(request);
    if (!teacherId) {
      return NextResponse.json({ error: '請先登入教師帳號' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const className = searchParams.get('className') || '';

    // Get teacher's taught classes
    const taughtClasses = await db.teacherClass.findMany({
      where: { teacherId },
      select: { classId: true },
    });
    const taughtClassIds = taughtClasses.map(tc => tc.classId);

    // If teacher has no taught classes, return all students (for admin-teachers)
    const where: any = { role: 'student', level: { not: 'Demo' } };
    if (taughtClassIds.length > 0) {
      where.classId = { in: taughtClassIds };
    }
    if (className) {
      where.class = { name: className };
    }

    const students = await db.user.findMany({
      where,
      select: {
        id: true, email: true, nameZh: true, nameEn: true,
        level: true, overallAccuracy: true, classNumber: true,
        class: { select: { id: true, name: true, gradeLevel: true } },
        _count: { select: { sessions: true, mistakes: true } },
      },
      orderBy: [{ class: { name: 'asc' } }, { classNumber: 'asc' }],
      take: 500,
    });

    const classes = await db.class.findMany({
      where: {
        name: { not: 'Demo' },
        ...(taughtClassIds.length > 0 ? { id: { in: taughtClassIds } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, gradeLevel: true },
    });

    return NextResponse.json({ students, classes, total: students.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
