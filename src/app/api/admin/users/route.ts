// ============================================
// GET /api/admin/users — 分頁查詢所有使用者
// 支援搜尋、篩選（role, level, className）
// 僅 admin 可存取
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // ---- 查詢參數 ----
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || ''; // 'student' | 'teacher' | 'admin' | ''
    const level = searchParams.get('level') || ''; // S1-S6
    const className = searchParams.get('className') || '';

    // ---- 構建查詢條件 ----
    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role;
    }

    if (level) {
      where.level = level;
    }

    if (className) {
      where.class = { name: className };
    }

    if (search) {
      where.OR = [
        { nameZh: { contains: search } },
        { nameEn: { contains: search } },
        { email: { contains: search } },
      ];
    }

    // ---- 查詢 ----
    const [users, total] = await Promise.all([
      db.user.findMany({
        where: where as any,
        select: {
          id: true,
          email: true,
          nameZh: true,
          nameEn: true,
          role: true,
          level: true,
          classNumber: true,
          overallAccuracy: true,
          streakDays: true,
          joinedAt: true,
          academicYear: true,
          subjects: true,
          department: true,
          createdAt: true,
          updatedAt: true,
          class: { select: { id: true, name: true, gradeLevel: true, academicYear: true } },
          _count: {
            select: {
              sessions: true,
              mistakes: true,
              vocabItems: true,
              submissions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.user.count({ where: where as any }),
    ]);

    // 取得所有班級清單（供前端篩選）
    const allClasses = await db.class.findMany({
      select: { id: true, name: true, gradeLevel: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      classes: allClasses,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/users] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
